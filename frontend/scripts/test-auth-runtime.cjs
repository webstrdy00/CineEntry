#!/usr/bin/env node

// Run with: node --test frontend/scripts/test-auth-runtime.cjs
// Production TypeScript runs unchanged in isolated VMs. Axios is real; only its
// adapter and native/browser storage are replaced. No request can reach a network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { inspect } = require('node:util');
const axios = require('axios');
const ts = require('typescript');

const SOURCE_ROOT = path.resolve(__dirname, '../src');
const ACCESS_KEY = 'cineentry_access_token';
const REFRESH_KEY = 'cineentry_refresh_token';
const AUTH_BASE = '/api/v1/auth';
const TEST_OPTIONS = { timeout: 5000 };
const compiledModules = new Map();
const allowedModules = new Set([
  path.join(SOURCE_ROOT, 'config/runtime.ts'),
  path.join(SOURCE_ROOT, 'lib/api.ts'),
  path.join(SOURCE_ROOT, 'services/authService.ts'),
]);

const oldTokens = {
  access_token: 'fixture-old-access',
  refresh_token: 'fixture-old-refresh',
  token_type: 'bearer',
  expires_in: 3600,
};
const newTokens = {
  ...oldTokens,
  access_token: 'fixture-new-access',
  refresh_token: 'fixture-new-refresh',
};
const loginResponse = {
  user: {
    id: 'fixture-user',
    email: 'fixture@example.test',
    display_name: null,
    avatar_url: null,
    auth_provider: 'google',
    auth_methods: ['google'],
    email_verified: true,
    has_password: false,
  },
  tokens: newTokens,
};

function deferred() {
  let resolve;
  const promise = new Promise((accept) => { resolve = accept; });
  return { promise, resolve };
}

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
const bodyOf = (config) => typeof config.data === 'string'
  ? JSON.parse(config.data)
  : config.data;
const envelope = (data) => ({ success: true, data });
const reply = (status, data) => ({ status, data });
const pendingKey = (provider) => `cineentry_oauth_pending_${provider}`;
const isRefresh = (config) => config.url.endsWith(`${AUTH_BASE}/refresh`);

function browserStorage() {
  const values = new Map();
  const operations = [];
  return {
    values,
    operations,
    getItem(key) {
      operations.push(['get', key]);
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      operations.push(['set', key]);
      values.set(key, String(value));
    },
    removeItem(key) {
      operations.push(['delete', key]);
      values.delete(key);
    },
  };
}

function createRuntime({ platform = 'ios', fullWeb = false, hooks = {}, dev = false, storage } = {}) {
  const nativeValues = storage?.nativeValues ?? new Map();
  const nativeOperations = [];
  const localStorage = storage?.localStorage ?? browserStorage();
  const sessionStorage = storage?.sessionStorage ?? browserStorage();
  const requests = [];
  const logs = [];
  const clock = { now: 1700000000000 };
  const state = { unauthorized: 0 };
  let handler = async (config) => {
    throw new Error(`Unexpected fixture request: ${config.method} ${config.url}`);
  };
  const secureStore = {
    async getItemAsync(key) {
      nativeOperations.push(['get', key]);
      if (hooks.get) await hooks.get(key);
      return nativeValues.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      nativeOperations.push(['set', key]);
      if (hooks.set) await hooks.set(key);
      nativeValues.set(key, value);
    },
    async deleteItemAsync(key) {
      nativeOperations.push(['delete', key]);
      if (hooks.delete) await hooks.delete(key);
      nativeValues.delete(key);
    },
  };

  // Axios custom adapters must implement status settlement themselves. Returning
  // an arbitrary 401 response without rejection would bypass real interceptors.
  // Timeout behavior is injected deterministically; these tests verify the real
  // request's timeout configuration, not native transport wall-clock timing.
  const adapter = async (config) => {
    requests.push({
      url: config.url,
      method: config.method,
      timeout: config.timeout,
      authorization: config.headers.get('Authorization') ?? null,
      body: bodyOf(config),
      retry: config._retry === true,
    });
    const result = await handler(config);
    const response = {
      data: result.data,
      status: result.status,
      statusText: String(result.status),
      headers: {},
      config,
      request: {},
    };
    if (config.validateStatus && !config.validateStatus(response.status)) {
      throw new axios.AxiosError(
        `Synthetic HTTP ${response.status}`,
        response.status >= 500 ? axios.AxiosError.ERR_BAD_RESPONSE : axios.AxiosError.ERR_BAD_REQUEST,
        config,
        response.request,
        response
      );
    }
    return response;
  };
  const isolatedAxios = axios.create({ adapter });
  const axiosModule = {
    __esModule: true,
    default: isolatedAxios,
    isAxiosError: axios.isAxiosError,
  };
  const context = vm.createContext({
    __DEV__: dev,
    process: {
      env: {
        EXPO_PUBLIC_API_URL: 'https://fixture-api.invalid',
        EXPO_PUBLIC_ENABLE_WEB_APP: fullWeb ? 'true' : undefined,
      },
    },
    console: Object.fromEntries(['log', 'warn', 'error'].map((level) => [
      level, (...args) => logs.push([level, ...args]),
    ])),
    URL,
    URLSearchParams,
    Date: class extends Date { static now() { return clock.now; } },
    localStorage,
    sessionStorage,
  });
  const modules = new Map();
  function loadModule(filename) {
    assert.ok(allowedModules.has(filename), `Unexpected source module: ${filename}`);
    if (modules.has(filename)) return modules.get(filename).exports;
    if (!compiledModules.has(filename)) {
      compiledModules.set(filename, ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        fileName: filename,
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.CommonJS,
          esModuleInterop: true,
        },
      }).outputText);
    }
    const module = { exports: {} };
    modules.set(filename, module);
    const requireModule = (specifier) => {
      if (specifier === 'axios') return axiosModule;
      if (specifier === 'react-native') return { Platform: { OS: platform } };
      if (specifier === 'expo-secure-store') return secureStore;
      assert.ok(specifier.startsWith('.'), `Unexpected external module: ${specifier}`);
      return loadModule(path.resolve(path.dirname(filename), `${specifier}.ts`));
    };
    const execute = new vm.Script(
      `(function (require, module, exports) {\n${compiledModules.get(filename)}\n})`,
      { filename }
    ).runInContext(context);
    execute(requireModule, module, module.exports);
    return module.exports;
  }

  const lib = loadModule(path.join(SOURCE_ROOT, 'lib/api.ts'));
  const auth = loadModule(path.join(SOURCE_ROOT, 'services/authService.ts'));
  lib.setOnUnauthorized(() => { state.unauthorized += 1; });
  const credentialValues = platform === 'web' ? localStorage.values : nativeValues;
  return {
    lib, api: lib.default, auth, nativeValues, nativeOperations,
    localStorage, sessionStorage, credentialValues, requests, logs, clock, state,
    storage: { nativeValues, localStorage, sessionStorage },
    setHandler(value) { handler = value; },
    seedTokens(tokens = oldTokens) {
      credentialValues.set(ACCESS_KEY, tokens.access_token);
      credentialValues.set(REFRESH_KEY, tokens.refresh_token);
    },
    pendingValues: platform === 'web' ? sessionStorage.values : nativeValues,
    refreshRequests() { return requests.filter(isRefresh); },
  };
}

function assertStoredTokens(runtime, tokens) {
  assert.equal(runtime.credentialValues.get(ACCESS_KEY), tokens.access_token);
  assert.equal(runtime.credentialValues.get(REFRESH_KEY), tokens.refresh_token);
}

function assertSafeErrorOutput(runtime, error, secrets) {
  for (const field of ['originalError', 'config', 'response', 'cause']) {
    assert.equal(field in error, false);
  }
  const output = [
    String(error), error.stack, JSON.stringify(error), inspect(error),
    JSON.stringify(runtime.logs), inspect(runtime.logs),
  ].join('\n');
  for (const secret of secrets) {
    assert.equal(output.includes(secret), false, 'Error output must not contain sensitive fixture data');
  }
}

async function concurrentRefresh(runtime, finishRefresh) {
  const refreshCount = runtime.refreshRequests().length;
  const protectedCount = runtime.requests.filter((request) => !isRefresh(request)).length;
  const jobs = [
    runtime.auth.refreshTokens(),
    runtime.auth.refreshTokens(),
    runtime.lib.refreshStoredTokens(),
    runtime.api.get('/api/v1/private/a'),
    runtime.api.get('/api/v1/private/b'),
    runtime.auth.getCurrentUser(),
  ];
  // Attach rejection handlers before releasing any failing response.
  const settled = Promise.allSettled(jobs);
  await nextTurn();
  assert.equal(runtime.refreshRequests().length, refreshCount + 1);
  assert.equal(runtime.requests.filter((request) => !isRefresh(request)).length, protectedCount + 3);
  finishRefresh.resolve();
  return settled;
}

async function assertConcurrentRecovery(runtime) {
  const finishRefresh = deferred();
  const refreshCount = runtime.refreshRequests().length;
  const protectedCount = runtime.requests.filter((request) => !isRefresh(request)).length;
  runtime.setHandler(async (config) => {
    if (isRefresh(config)) {
      assert.deepEqual(bodyOf(config), { refresh_token: oldTokens.refresh_token });
      await finishRefresh.promise;
      return reply(200, envelope(newTokens));
    }
    if (config.headers.get('Authorization') === `Bearer ${oldTokens.access_token}`) {
      return reply(401, { detail: 'Synthetic expired access token' });
    }
    assert.equal(config.headers.get('Authorization'), `Bearer ${newTokens.access_token}`);
    assert.equal(config._retry, true);
    assertStoredTokens(runtime, newTokens);
    return reply(200, envelope(loginResponse.user));
  });
  const outcomes = await concurrentRefresh(runtime, finishRefresh);
  assert.ok(outcomes.every((outcome) => outcome.status === 'fulfilled'));
  for (const index of [0, 1, 2]) assert.deepEqual(outcomes[index].value, newTokens);
  for (const index of [3, 4]) assert.deepEqual(outcomes[index].value.data, envelope(loginResponse.user));
  assert.deepEqual(outcomes[5].value, loginResponse.user);
  assert.equal(runtime.refreshRequests().length, refreshCount + 1);
  assert.equal(runtime.requests.filter((request) => !isRefresh(request)).length, protectedCount + 6);
  assertStoredTokens(runtime, newTokens);
}

test('raw refresh has a finite independent timeout and stores validated tokens', TEST_OPTIONS, async () => {
  const runtime = createRuntime();
  runtime.seedTokens();
  assert.equal(runtime.api.defaults.timeout, 10000);
  runtime.api.defaults.timeout = 1;
  runtime.setHandler(async (config) => {
    assert.ok(isRefresh(config));
    return reply(200, envelope(newTokens));
  });
  assert.deepEqual(await runtime.auth.refreshTokens(), newTokens);
  const [request] = runtime.refreshRequests();
  assert.equal(request.timeout, 10000);
  assert.deepEqual(request.body, { refresh_token: oldTokens.refresh_token });
  assert.equal(request.authorization, null);
  assertStoredTokens(runtime, newTokens);
});

test('manual and interceptor refresh share one flight and every request retries once', TEST_OPTIONS, async () => {
  const runtime = createRuntime();
  const finishRefresh = deferred();
  runtime.seedTokens();
  runtime.setHandler(async (config) => {
    if (isRefresh(config)) {
      await finishRefresh.promise;
      return reply(200, envelope(newTokens));
    }
    if (config.headers.get('Authorization') === `Bearer ${oldTokens.access_token}`) {
      return reply(401, { detail: 'Synthetic expired access token' });
    }
    assert.equal(config.headers.get('Authorization'), `Bearer ${newTokens.access_token}`);
    assert.equal(config._retry, true);
    assertStoredTokens(runtime, newTokens);
    return reply(200, envelope(loginResponse.user));
  });
  const outcomes = await concurrentRefresh(runtime, finishRefresh);
  assert.ok(outcomes.every((outcome) => outcome.status === 'fulfilled'));
  assert.equal(runtime.refreshRequests().length, 1);
  assert.equal(runtime.requests.filter((request) => !isRefresh(request)).length, 6);
  assert.equal(runtime.state.unauthorized, 0);
});

const transientCases = [
  ['network', (config) => { throw new axios.AxiosError('Synthetic offline', axios.AxiosError.ERR_NETWORK, config); }],
  ['timeout', (config) => { throw new axios.AxiosError('Synthetic timeout', 'ECONNABORTED', config); }],
  ['HTTP 500', () => reply(500, { detail: 'Synthetic server failure' })],
  ['HTTP 503', () => reply(503, { detail: 'Synthetic unavailable' })],
  ['refresh HTTP 404', () => reply(404, { detail: 'Synthetic routing failure' })],
  ['HTTP 422', () => reply(422, { detail: 'Synthetic schema failure' })],
  ['malformed HTTP 200', () => reply(200, envelope({ ...newTokens, refresh_token: '' }))],
];
for (const [name, fail] of transientCases) {
  test(`${name}: failed concurrent wave settles and reconnect refreshes once for a healthy concurrent wave`, TEST_OPTIONS, async () => {
    const runtime = createRuntime();
    const finishRefresh = deferred();
    runtime.seedTokens();
    runtime.setHandler(async (config) => {
      if (isRefresh(config)) {
        await finishRefresh.promise;
        return fail(config);
      }
      return reply(401, { detail: 'Synthetic expired access token' });
    });
    const outcomes = await concurrentRefresh(runtime, finishRefresh);
    assert.ok(outcomes.every((outcome) => outcome.status === 'rejected'));
    for (const index of [0, 1, 5]) {
      assert.ok(runtime.auth.isAuthSessionUnavailableError(outcomes[index].reason));
    }
    assertStoredTokens(runtime, oldTokens);
    assert.equal(runtime.state.unauthorized, 0);
    assert.equal(runtime.nativeOperations.filter(([operation]) => operation === 'delete').length, 0);
    await assertConcurrentRecovery(runtime);
    assert.equal(runtime.refreshRequests().length, 2);
    assert.equal(runtime.state.unauthorized, 0);
    runtime.setHandler(async (config) => {
      assert.equal(isRefresh(config), false);
      assert.equal(config.headers.get('Authorization'), `Bearer ${newTokens.access_token}`);
      return reply(200, envelope(loginResponse.user));
    });
    assert.deepEqual(await runtime.auth.getCurrentUser(), loginResponse.user);
    assert.equal(runtime.refreshRequests().length, 2);
  });
}

test('definitive refresh HTTP 401 clears credentials and settles every caller', TEST_OPTIONS, async () => {
  const runtime = createRuntime();
  const finishRefresh = deferred();
  runtime.seedTokens();
  runtime.setHandler(async (config) => {
    if (isRefresh(config)) await finishRefresh.promise;
    return reply(401, { detail: 'Synthetic rejected credential' });
  });
  const outcomes = await concurrentRefresh(runtime, finishRefresh);
  for (const index of [0, 1, 5]) {
    assert.equal(outcomes[index].status, 'fulfilled');
    assert.equal(outcomes[index].value, null);
  }
  for (const index of [2, 3, 4]) {
    assert.equal(outcomes[index].status, 'rejected');
    assert.ok(runtime.lib.isRefreshCredentialRejected(outcomes[index].reason));
  }
  assert.equal(runtime.credentialValues.has(ACCESS_KEY), false);
  assert.equal(runtime.credentialValues.has(REFRESH_KEY), false);
  assert.equal(runtime.state.unauthorized, 1);
  const restarted = createRuntime({ storage: runtime.storage });
  assert.equal(await restarted.auth.getAccessToken(), null);
  assert.equal(await restarted.auth.getRefreshToken(), null);
  assert.equal(await restarted.auth.refreshTokens(), null);
  assert.equal(restarted.requests.length, 0);
  await runtime.auth.saveTokens(oldTokens);
  await assertConcurrentRecovery(runtime);
  assert.equal(runtime.refreshRequests().length, 2);
  assert.equal(runtime.state.unauthorized, 1);
});

test('waiters arriving during credential cleanup are rejected, not orphaned', TEST_OPTIONS, async () => {
  const deletionStarted = deferred();
  const finishDeletion = deferred();
  const runtime = createRuntime({
    hooks: {
      async delete(key) {
        if (key === ACCESS_KEY) {
          deletionStarted.resolve();
          await finishDeletion.promise;
        }
      },
    },
  });
  runtime.seedTokens();
  runtime.setHandler(async () => reply(401, { detail: 'Synthetic revoked session' }));
  const leader = runtime.lib.refreshStoredTokens();
  const leaderOutcome = Promise.allSettled([leader]);
  await deletionStarted.promise;
  const lateWaiter = runtime.lib.refreshStoredTokens();
  const lateOutcome = Promise.allSettled([lateWaiter]);
  finishDeletion.resolve();
  assert.equal((await leaderOutcome)[0].status, 'rejected');
  assert.equal((await lateOutcome)[0].status, 'rejected');
  assert.equal(runtime.refreshRequests().length, 1);
  assert.equal(runtime.state.unauthorized, 1);
  runtime.seedTokens();
  runtime.setHandler(async () => reply(200, envelope(newTokens)));
  assert.deepEqual(await runtime.lib.refreshStoredTokens(), newTokens);
});

test('storage cleanup failure still rejects queued callers and resets refresh state', TEST_OPTIONS, async () => {
  const hooks = { delete: async () => { throw new Error('Synthetic storage failure'); } };
  const runtime = createRuntime({ hooks });
  runtime.seedTokens();
  runtime.setHandler(async () => reply(401, { detail: 'Synthetic revoked session' }));
  const outcomes = await Promise.allSettled([
    runtime.lib.refreshStoredTokens(), runtime.lib.refreshStoredTokens(),
  ]);
  assert.ok(outcomes.every((outcome) => outcome.status === 'rejected'));
  hooks.delete = undefined;
  runtime.setHandler(async () => reply(200, envelope(newTokens)));
  assert.deepEqual(await runtime.lib.refreshStoredTokens(), newTokens);
  assert.equal(runtime.refreshRequests().length, 2);
});

test('unauthorized callback failure still settles the queue and resets refresh state', TEST_OPTIONS, async () => {
  const runtime = createRuntime();
  runtime.seedTokens();
  runtime.lib.setOnUnauthorized(() => { throw new Error('Synthetic unauthorized callback failure'); });
  runtime.setHandler(async () => reply(401, { detail: 'Synthetic revoked session' }));
  const outcomes = await Promise.allSettled([
    runtime.lib.refreshStoredTokens(), runtime.lib.refreshStoredTokens(),
  ]);
  assert.ok(outcomes.every((outcome) => outcome.status === 'rejected'));
  assert.equal(runtime.credentialValues.has(ACCESS_KEY), false);
  assert.equal(runtime.credentialValues.has(REFRESH_KEY), false);
  runtime.seedTokens();
  runtime.setHandler(async () => reply(200, envelope(newTokens)));
  assert.deepEqual(await runtime.lib.refreshStoredTokens(), newTokens);
  assert.equal(runtime.refreshRequests().length, 2);
});

test('full web session survives 503, recovers concurrently, then expires only on confirmed credential 401', TEST_OPTIONS, async () => {
  const runtime = createRuntime({ platform: 'web', fullWeb: true });
  runtime.seedTokens();
  runtime.setHandler(async () => reply(503, { detail: 'Synthetic unavailable' }));
  await assert.rejects(runtime.auth.refreshTokens(), runtime.auth.isAuthSessionUnavailableError);
  await assert.rejects(runtime.auth.getCurrentUser(), runtime.auth.isAuthSessionUnavailableError);
  assertStoredTokens(runtime, oldTokens);
  assert.equal(runtime.refreshRequests().length, 1);
  assert.equal(runtime.localStorage.operations.filter(([operation]) => operation === 'delete').length, 0);
  assert.equal(runtime.state.unauthorized, 0);
  await assertConcurrentRecovery(runtime);
  assert.equal(runtime.refreshRequests().length, 2);
  runtime.setHandler(async () => reply(401, { detail: 'Synthetic rejected credential' }));
  assert.equal(await runtime.auth.getCurrentUser(), null);
  assert.equal(runtime.refreshRequests().length, 3);
  assert.equal(runtime.localStorage.values.size, 0);
  assert.equal(runtime.nativeOperations.length, 0);
  assert.equal(runtime.state.unauthorized, 1);
  const restarted = createRuntime({ platform: 'web', fullWeb: true, storage: runtime.storage });
  assert.equal(await restarted.auth.getAccessToken(), null);
  assert.equal(await restarted.auth.getRefreshToken(), null);
  assert.equal(await restarted.auth.refreshTokens(), null);
  assert.equal(restarted.requests.length, 0);
  assert.equal(runtime.localStorage.values.size, 0);
});

test('full web offline session lookup preserves tokens and reconnect settles a healthy concurrent wave', TEST_OPTIONS, async () => {
  const runtime = createRuntime({ platform: 'web', fullWeb: true });
  await runtime.auth.saveTokens(oldTokens);
  runtime.setHandler(async (config) => {
    if (isRefresh(config)) {
      throw new axios.AxiosError('Synthetic offline', axios.AxiosError.ERR_NETWORK, config);
    }
    return reply(401, { detail: 'Synthetic expired access token' });
  });
  await assert.rejects(runtime.auth.getCurrentUser(), runtime.auth.isAuthSessionUnavailableError);
  assertStoredTokens(runtime, oldTokens);
  assert.equal(runtime.refreshRequests().length, 1);
  assert.equal(runtime.state.unauthorized, 0);
  assert.equal(runtime.localStorage.operations.filter(([operation]) => operation === 'delete').length, 0);
  await assertConcurrentRecovery(runtime);
  assert.equal(runtime.refreshRequests().length, 2);
  assert.equal(runtime.state.unauthorized, 0);
  assert.equal(runtime.nativeOperations.length, 0);
});

for (const platform of ['ios', 'web']) {
  test(`${platform}: fresh VM reads persisted credentials and recovers independently of an abandoned refresh flight`, TEST_OPTIONS, async () => {
    const previous = createRuntime({ platform, fullWeb: true });
    await previous.auth.saveTokens(oldTokens);
    const refreshStarted = deferred();
    const finishAbandonedRefresh = deferred();
    previous.setHandler(async (config) => {
      if (isRefresh(config)) {
        refreshStarted.resolve();
        await finishAbandonedRefresh.promise;
        return reply(503, { detail: 'Synthetic abandoned offline session' });
      }
      return reply(401, { detail: 'Synthetic expired access token' });
    });
    const abandoned = Promise.allSettled([previous.auth.getCurrentUser()]);
    await refreshStarted.promise;
    const restarted = createRuntime({ platform, fullWeb: true, storage: previous.storage });
    try {
      assert.notEqual(restarted.auth, previous.auth);
      assert.notEqual(restarted.lib, previous.lib);
      assert.notEqual(restarted.api, previous.api);
      const readStart = platform === 'web' ? restarted.localStorage.operations.length : 0;
      assert.equal(await restarted.auth.getAccessToken(), oldTokens.access_token);
      assert.equal(await restarted.auth.getRefreshToken(), oldTokens.refresh_token);
      const reads = platform === 'web'
        ? restarted.localStorage.operations.slice(readStart)
        : restarted.nativeOperations;
      for (const key of [ACCESS_KEY, REFRESH_KEY]) {
        assert.ok(reads.some(([operation, storedKey]) => operation === 'get' && storedKey === key));
      }
      await assertConcurrentRecovery(restarted);
      assert.equal(restarted.refreshRequests().length, 1);
      assert.equal(previous.refreshRequests().length, 1);
      assert.equal(restarted.state.unauthorized, 0);
      assert.equal(restarted.nativeOperations.length === 0, platform === 'web');
    } finally {
      finishAbandonedRefresh.resolve();
      await abandoned;
    }
    const [outcome] = await abandoned;
    assert.equal(outcome.status, 'rejected');
    assert.ok(previous.auth.isAuthSessionUnavailableError(outcome.reason));
    assertStoredTokens(restarted, newTokens);
    assertStoredTokens(previous, newTokens);
    assert.equal(previous.state.unauthorized, 0);
  });
}

for (const operation of ['refreshTokens', 'getCurrentUser']) {
  for (const failure of ['network', 'HTTP 503']) {
    test(`${operation}/${failure}: safe error serialization and inspection expose no Axios body or tokens`, TEST_OPTIONS, async () => {
      const runtime = createRuntime({ dev: true });
      const sensitiveBody = 'fixture-private-auth-response-body';
      runtime.seedTokens();
      runtime.setHandler(async (config) => {
        if (failure === 'network') {
          throw new axios.AxiosError(sensitiveBody, axios.AxiosError.ERR_NETWORK, config);
        }
        return reply(503, { detail: sensitiveBody, tokens: newTokens });
      });
      await assert.rejects(runtime.auth[operation](), (error) => {
        assert.ok(runtime.auth.isAuthSessionUnavailableError(error));
        assertSafeErrorOutput(runtime, error, [
          sensitiveBody, oldTokens.access_token, oldTokens.refresh_token,
          newTokens.access_token, newTokens.refresh_token,
        ]);
        return true;
      });
      assertStoredTokens(runtime, oldTokens);
      assert.equal(runtime.state.unauthorized, 0);
    });
  }
}

test('logout clears credentials after failure without logging request tokens or response body', TEST_OPTIONS, async () => {
  const runtime = createRuntime({ dev: true });
  const sensitiveBody = 'fixture-private-logout-response-body';
  runtime.seedTokens();
  runtime.setHandler(async (config) => {
    assert.equal(config.url, `${AUTH_BASE}/logout`);
    assert.equal(config.headers.get('Authorization'), `Bearer ${oldTokens.access_token}`);
    return reply(503, { detail: sensitiveBody, tokens: newTokens });
  });
  await runtime.auth.logout();
  assert.equal(runtime.credentialValues.has(ACCESS_KEY), false);
  assert.equal(runtime.credentialValues.has(REFRESH_KEY), false);
  const output = `${JSON.stringify(runtime.logs)}\n${inspect(runtime.logs)}`;
  for (const secret of [
    sensitiveBody, oldTokens.access_token, oldTokens.refresh_token,
    newTokens.access_token, newTokens.refresh_token,
  ]) {
    assert.equal(output.includes(secret), false, 'Logout logs must not contain sensitive fixture data');
  }
  assert.ok(runtime.logs.some(([, message]) => message === 'Logout API error (ignored)'));
});

test('late old-token 401 reuses stored new token without a second refresh', TEST_OPTIONS, async () => {
  const runtime = createRuntime();
  const requestStarted = deferred();
  const finishOldRequest = deferred();
  runtime.seedTokens();
  runtime.setHandler(async (config) => {
    if (isRefresh(config)) return reply(200, envelope(newTokens));
    if (config.headers.get('Authorization') === `Bearer ${oldTokens.access_token}`) {
      requestStarted.resolve();
      await finishOldRequest.promise;
      return reply(401, { detail: 'Synthetic late access rejection' });
    }
    return reply(200, envelope({ recovered: true }));
  });
  const request = runtime.api.get('/api/v1/private/late');
  const outcome = Promise.allSettled([request]);
  await requestStarted.promise;
  await runtime.auth.refreshTokens();
  finishOldRequest.resolve();
  assert.equal((await outcome)[0].status, 'fulfilled');
  assert.equal(runtime.refreshRequests().length, 1);
  assert.equal(runtime.requests.filter((entry) => !isRefresh(entry)).length, 2);
});

test('a retried protected-request 401 cannot start another refresh', TEST_OPTIONS, async () => {
  const runtime = createRuntime();
  runtime.seedTokens();
  runtime.setHandler(async (config) => isRefresh(config)
    ? reply(200, envelope(newTokens))
    : reply(401, { detail: 'Synthetic persistent access rejection' }));
  await assert.rejects(runtime.api.get('/api/v1/private/rejected'), (error) => error.response.status === 401);
  assert.equal(runtime.refreshRequests().length, 1);
  assert.equal(runtime.requests.filter((entry) => !isRefresh(entry)).length, 2);
});

function oauthStart(provider, suffix = 'one') {
  const state = `fixture-${provider}-state-${suffix}`;
  const host = provider === 'google' ? 'accounts.google.com' : 'kauth.kakao.com';
  const pathname = provider === 'google' ? '/o/oauth2/v2/auth' : '/oauth/authorize';
  return {
    url: `https://${host}${pathname}?state=${encodeURIComponent(state)}`,
    state,
    transaction_token: `fixture-${provider}-proof-${suffix}-`.padEnd(48, 'x'),
    expires_in: 60,
  };
}

function oauthMethods(runtime, provider) {
  return provider === 'google'
    ? { start: runtime.auth.getGoogleAuthUrl, callback: runtime.auth.handleGoogleCallback }
    : { start: runtime.auth.getKakaoAuthUrl, callback: runtime.auth.handleKakaoCallback };
}

for (const platform of ['ios', 'web']) {
  for (const provider of ['google', 'kakao']) {
    test(`${platform}/${provider}: proof is locally persisted and consumed before one callback POST`, TEST_OPTIONS, async () => {
      const runtime = createRuntime({ platform, fullWeb: true, dev: true });
      const result = oauthStart(provider);
      const key = pendingKey(provider);
      const methods = oauthMethods(runtime, provider);
      const startedAt = runtime.clock.now;
      runtime.setHandler(async (config) => {
        if (config.method === 'get') return reply(200, envelope(result));
        assert.equal(config.url, `${AUTH_BASE}/${provider}/callback`);
        assert.equal(runtime.pendingValues.has(key), false);
        assert.deepEqual(bodyOf(config), {
          code: 'fixture-code', state: result.state, transaction_token: result.transaction_token,
        });
        return reply(200, envelope(loginResponse));
      });
      assert.deepEqual(await methods.start(platform === 'web' ? 'web' : 'mobile'), result);
      assert.deepEqual(JSON.parse(runtime.pendingValues.get(key)), {
        provider, state: result.state, transaction_token: result.transaction_token,
        expires_at: startedAt + result.expires_in * 1000,
      });
      assert.equal(runtime.localStorage.values.has(key), false);
      const wrongStore = platform === 'web' ? runtime.nativeValues : runtime.sessionStorage.values;
      assert.equal(wrongStore.has(key), false);
      runtime.clock.now = startedAt + result.expires_in * 1000 - 1;
      assert.deepEqual(await methods.callback('fixture-code', result.state), loginResponse);
      assertStoredTokens(runtime, newTokens);
      const requestCount = runtime.requests.length;
      await assert.rejects(methods.callback('fixture-code', result.state));
      assert.equal(runtime.requests.length, requestCount);
      assert.equal(runtime.pendingValues.has(key), false);
      assert.ok(runtime.requests.every((request) => !request.url.includes(result.transaction_token)));
      assert.ok(!JSON.stringify(runtime.logs).includes(result.transaction_token));
    });

    test(`${platform}/${provider}: fresh VM reads and consumes persisted OAuth proof without restarting authorization`, TEST_OPTIONS, async () => {
      const previous = createRuntime({ platform, fullWeb: true });
      const result = oauthStart(provider, 'restart');
      const key = pendingKey(provider);
      await previous.auth.saveTokens(oldTokens);
      previous.setHandler(async (config) => {
        assert.equal(config.url, `${AUTH_BASE}/${provider}`);
        return reply(200, envelope(result));
      });
      await oauthMethods(previous, provider).start(platform === 'web' ? 'web' : 'mobile');
      const pending = previous.pendingValues.get(key);
      const restarted = createRuntime({ platform, fullWeb: true, storage: previous.storage });
      restarted.clock.now = previous.clock.now + 1000;
      assert.notEqual(restarted.auth, previous.auth);
      assert.equal(restarted.pendingValues.get(key), pending);
      assertStoredTokens(restarted, oldTokens);
      restarted.setHandler(async (config) => {
        assert.equal(config.method, 'post');
        assert.equal(config.url, `${AUTH_BASE}/${provider}/callback`);
        assert.equal(config.headers.get('Authorization'), `Bearer ${oldTokens.access_token}`);
        assert.deepEqual(bodyOf(config), {
          code: 'fixture-restart-code', state: result.state, transaction_token: result.transaction_token,
        });
        assert.equal(restarted.pendingValues.has(key), false);
        return reply(200, envelope(loginResponse));
      });
      assert.deepEqual(
        await oauthMethods(restarted, provider).callback('fixture-restart-code', result.state),
        loginResponse
      );
      const operations = platform === 'web'
        ? restarted.sessionStorage.operations
        : restarted.nativeOperations;
      const readIndex = operations.findIndex(([operation, storedKey]) => operation === 'get' && storedKey === key);
      const deleteIndex = operations.findIndex(([operation, storedKey]) => operation === 'delete' && storedKey === key);
      assert.ok(readIndex >= 0);
      assert.ok(deleteIndex > readIndex);
      assert.equal(restarted.requests.length, 1);
      assert.equal(previous.requests.length, 1);
      assertStoredTokens(restarted, newTokens);
      assertStoredTokens(previous, newTokens);
      await assert.rejects(oauthMethods(restarted, provider).callback('fixture-restart-code', result.state));
      await assert.rejects(oauthMethods(previous, provider).callback('fixture-restart-code', result.state));
      assert.equal(restarted.requests.length, 1);
      assert.equal(previous.requests.length, 1);
      assert.equal(previous.pendingValues.has(key), false);
      assert.equal(restarted.state.unauthorized, 0);
    });
  }
}

test('wrong/missing/provider-mismatched state makes no callback request and preserves pending attempt', TEST_OPTIONS, async () => {
  const runtime = createRuntime();
  const result = oauthStart('google');
  runtime.setHandler(async () => reply(200, envelope(result)));
  await runtime.auth.getGoogleAuthUrl('mobile');
  const pending = runtime.pendingValues.get(pendingKey('google'));
  await assert.rejects(runtime.auth.handleGoogleCallback('fixture-code', `${result.state}-wrong`));
  await assert.rejects(runtime.auth.handleGoogleCallback('fixture-code'));
  await assert.rejects(runtime.auth.handleKakaoCallback('fixture-code', result.state));
  assert.equal(runtime.requests.length, 1);
  assert.equal(runtime.pendingValues.get(pendingKey('google')), pending);
});

for (const offset of [0, 1]) {
  test(`OAuth callback at expiry + ${offset}ms is rejected before network`, TEST_OPTIONS, async () => {
    const runtime = createRuntime();
    const result = oauthStart('google');
    runtime.setHandler(async () => reply(200, envelope(result)));
    await runtime.auth.getGoogleAuthUrl('mobile');
    const pending = JSON.parse(runtime.pendingValues.get(pendingKey('google')));
    runtime.clock.now = pending.expires_at + offset;
    await assert.rejects(runtime.auth.handleGoogleCallback('fixture-code', result.state));
    assert.equal(runtime.requests.length, 1);
  });
}

test('simultaneous native callbacks consume one pending proof and issue one POST', TEST_OPTIONS, async () => {
  const runtime = createRuntime();
  const result = oauthStart('google');
  const callbackStarted = deferred();
  const finishCallback = deferred();
  runtime.setHandler(async (config) => {
    if (config.method === 'get') return reply(200, envelope(result));
    assert.equal(runtime.pendingValues.has(pendingKey('google')), false);
    callbackStarted.resolve();
    await finishCallback.promise;
    return reply(200, envelope(loginResponse));
  });
  await runtime.auth.getGoogleAuthUrl('mobile');
  const settled = Promise.allSettled([
    runtime.auth.handleGoogleCallback('fixture-code', result.state),
    runtime.auth.handleGoogleCallback('fixture-code', result.state),
  ]);
  await callbackStarted.promise;
  finishCallback.resolve();
  const outcomes = await settled;
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected').length, 1);
  assert.equal(runtime.requests.filter((request) => request.method === 'post').length, 1);
});

test('callback transport failure consumes proof, preserves credentials, and exposes no Axios proof body', TEST_OPTIONS, async () => {
  const runtime = createRuntime({ dev: true });
  const result = oauthStart('google');
  runtime.seedTokens();
  runtime.setHandler(async (config) => {
    if (config.method === 'get') return reply(200, envelope(result));
    throw new axios.AxiosError('Synthetic callback transport error', axios.AxiosError.ERR_NETWORK, config);
  });
  await runtime.auth.getGoogleAuthUrl('mobile');
  await assert.rejects(runtime.auth.handleGoogleCallback('fixture-code', result.state), (error) => {
    assertSafeErrorOutput(runtime, error, [
      'fixture-code', result.transaction_token,
      oldTokens.access_token, oldTokens.refresh_token,
    ]);
    return true;
  });
  assert.equal(runtime.pendingValues.has(pendingKey('google')), false);
  assertStoredTokens(runtime, oldTokens);
  await assert.rejects(runtime.auth.handleGoogleCallback('fixture-code', result.state));
  assert.equal(runtime.requests.filter((request) => request.method === 'post').length, 1);
  assert.ok(!JSON.stringify(runtime.logs).includes(result.transaction_token));
});

test('failure to delete pending native proof prevents callback HTTP request', TEST_OPTIONS, async () => {
  const runtime = createRuntime({
    hooks: { delete: async () => { throw new Error('Synthetic pending-store failure'); } },
  });
  const result = oauthStart('kakao');
  runtime.setHandler(async () => reply(200, envelope(result)));
  await runtime.auth.getKakaoAuthUrl('mobile');
  await assert.rejects(runtime.auth.handleKakaoCallback('fixture-code', result.state));
  assert.equal(runtime.requests.length, 1);
  assert.equal(runtime.pendingValues.has(pendingKey('kakao')), true);
});

const invalidStarts = [
  ['missing proof', (value) => { delete value.transaction_token; }],
  ['short proof', (value) => { value.transaction_token = 'short'; }],
  ['missing state', (value) => { value.state = ''; }],
  ['zero expiry', (value) => { value.expires_in = 0; }],
  ['nonfinite expiry', (value) => { value.expires_in = Infinity; }],
  ['fractional expiry', (value) => { value.expires_in = 0.5; }],
  ['HTTP URL', (value) => { value.url = value.url.replace('https:', 'http:'); }],
  ['wrong host', (value) => { value.url = value.url.replace('accounts.google.com', 'attacker.invalid'); }],
  ['mismatched URL state', (value) => { value.state += '-wrong'; }],
  ['proof in URL', (value) => { value.url += `&transaction_token=${value.transaction_token}`; }],
];
for (const [name, invalidate] of invalidStarts) {
  test(`invalid OAuth start (${name}) saves no pending proof`, TEST_OPTIONS, async () => {
    const runtime = createRuntime();
    const result = oauthStart('google');
    invalidate(result);
    runtime.setHandler(async () => reply(200, envelope(result)));
    await assert.rejects(runtime.auth.getGoogleAuthUrl('mobile'));
    assert.equal(runtime.pendingValues.has(pendingKey('google')), false);
    assert.equal(runtime.nativeOperations.filter(([operation]) => operation === 'set').length, 0);
  });
}

for (const [name, stored] of [
  ['invalid JSON', '{'],
  ['wrong stored provider', JSON.stringify({ provider: 'kakao', state: 'fixture-state', transaction_token: 'x'.repeat(48), expires_at: 1700000060000 })],
  ['missing stored proof', JSON.stringify({ provider: 'google', state: 'fixture-state', expires_at: 1700000060000 })],
]) {
  test(`invalid pending OAuth (${name}) sends no network request`, TEST_OPTIONS, async () => {
    const runtime = createRuntime();
    runtime.pendingValues.set(pendingKey('google'), stored);
    await assert.rejects(runtime.auth.handleGoogleCallback('fixture-code', 'fixture-state'));
    assert.equal(runtime.requests.length, 0);
  });
}

test('new provider attempt replaces old state without affecting another provider', TEST_OPTIONS, async () => {
  const runtime = createRuntime();
  let googleResult = oauthStart('google', 'old');
  const kakaoResult = oauthStart('kakao');
  runtime.setHandler(async (config) => reply(200, envelope(
    config.url.endsWith('/google') ? googleResult : kakaoResult
  )));
  await runtime.auth.getGoogleAuthUrl('mobile');
  await runtime.auth.getKakaoAuthUrl('mobile');
  const oldState = googleResult.state;
  const kakaoPending = runtime.pendingValues.get(pendingKey('kakao'));
  googleResult = oauthStart('google', 'new');
  await runtime.auth.getGoogleAuthUrl('mobile');
  await assert.rejects(runtime.auth.handleGoogleCallback('fixture-code', oldState));
  assert.equal(runtime.requests.length, 3);
  assert.equal(JSON.parse(runtime.pendingValues.get(pendingKey('google'))).state, googleResult.state);
  assert.equal(runtime.pendingValues.get(pendingKey('kakao')), kakaoPending);
});

test('default bridge-only web refuses OAuth and refresh without storing proofs or calling backend', TEST_OPTIONS, async () => {
  const runtime = createRuntime({ platform: 'web' });
  runtime.seedTokens();
  for (const start of [runtime.auth.getGoogleAuthUrl, runtime.auth.getKakaoAuthUrl]) {
    await assert.rejects(start('web'));
    await assert.rejects(start('mobile'));
  }
  for (const callback of [runtime.auth.handleGoogleCallback, runtime.auth.handleKakaoCallback]) {
    await assert.rejects(callback('fixture-code', 'fixture-state'));
  }
  assert.equal(await runtime.auth.getAccessToken(), null);
  assert.equal(await runtime.auth.getRefreshToken(), null);
  assert.equal(await runtime.auth.refreshTokens(), null);
  assert.equal(runtime.requests.length, 0);
  assert.equal(runtime.nativeValues.size, 0);
  assert.equal(runtime.sessionStorage.values.size, 0);
  assert.equal(runtime.localStorage.values.size, 0);
});
