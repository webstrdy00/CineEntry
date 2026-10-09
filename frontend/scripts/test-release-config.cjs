const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../app.config.js"), "utf8");

function configure(env, config = { name: "CineEntry", extra: { preserved: true } }) {
  const context = { module: { exports: {} }, process: { env }, URL };
  vm.runInNewContext(source, context);
  return context.module.exports({ config });
}

for (const value of [
  undefined,
  "not a URL",
  "http://api.example.test",
  "https://user:private-password@api.example.test",
  "https://api.example.test/api/v1",
  "https://api.example.test?token=private-token",
  "https://api.example.test#fragment",
  "https://localhost",
  "https://dev.localhost",
  "https://127.0.0.1",
  "https://127.1",
  "https://[::1]",
]) {
  test(`release API configuration rejection case ${String(value).split(":")[0]}`, () => {
    assert.throws(
      () => configure({ NODE_ENV: "production", EXPO_PUBLIC_API_URL: value }),
      (error) => error.message.includes("EXPO_PUBLIC_API_URL")
        && !error.message.includes("private-password")
        && !error.message.includes("private-token"),
    );
  });
}

for (const profile of ["preview", "production"]) {
  test(`EAS ${profile} requires HTTPS even without NODE_ENV`, () => {
    assert.throws(() => configure({ EAS_BUILD_PROFILE: profile }), /EXPO_PUBLIC_API_URL/);
  });
}

test("valid release origin preserves the complete Expo configuration", () => {
  const config = { name: "CineEntry", android: { package: "com.example.test" }, extra: { preserved: true } };
  assert.equal(configure({ NODE_ENV: "production", EXPO_PUBLIC_API_URL: "https://api.example.test/" }, config), config);
});

test("local development retains an HTTP emulator API configuration", () => {
  assert.equal(configure({ NODE_ENV: "development", EXPO_PUBLIC_API_URL: "http://127.0.0.1:8008" }).name, "CineEntry");
});
