export const PASSWORD_MIN_LENGTH = 10;

const COMMON_PASSWORDS = new Set([
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  '12345678910',
  'abc123',
  'admin',
  'admin123',
  'asdf1234',
  'dragon',
  'football',
  'iloveyou',
  'letmein',
  'login',
  'master',
  'monkey',
  'passw0rd',
  'password',
  'password1',
  'password12',
  'password123',
  'qwer1234',
  'qwerty',
  'qwerty123',
  'qwerty12345',
  'user1234',
  'welcome',
  'welcome123',
]);

const SEQUENCE_SOURCES = [
  '0123456789',
  'abcdefghijklmnopqrstuvwxyz',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
];

const normalizeValue = (value: string) =>
  Array.from(value.toLowerCase())
    .filter((char) => /[0-9a-zA-Z가-힣]/.test(char))
    .join('');

const hasMeaningfulFragment = (value: string) => {
  if (value.length >= 3) {
    return true;
  }

  return value.length >= 2 && Array.from(value).some((char) => char.charCodeAt(0) > 127);
};

const collectPersonalFragments = (email?: string, displayName?: string) => {
  const fragments = new Set<string>();

  const emailLocalPart = (email || '').split('@')[0] || '';
  const normalizedEmail = normalizeValue(emailLocalPart);
  if (hasMeaningfulFragment(normalizedEmail)) {
    fragments.add(normalizedEmail);
  }

  emailLocalPart
    .toLowerCase()
    .split(/[^0-9a-zA-Z가-힣]+/)
    .filter(Boolean)
    .forEach((token) => {
      const normalizedToken = normalizeValue(token);
      if (hasMeaningfulFragment(normalizedToken)) {
        fragments.add(normalizedToken);
      }
    });

  const normalizedDisplayName = normalizeValue(displayName || '');
  if (hasMeaningfulFragment(normalizedDisplayName)) {
    fragments.add(normalizedDisplayName);
  }

  (displayName || '')
    .toLowerCase()
    .split(/[^0-9a-zA-Z가-힣]+/)
    .filter(Boolean)
    .forEach((token) => {
      const normalizedToken = normalizeValue(token);
      if (hasMeaningfulFragment(normalizedToken)) {
        fragments.add(normalizedToken);
      }
    });

  return Array.from(fragments);
};

const isRepeatedChunk = (value: string) => {
  if (value.length < 6) {
    return false;
  }

  for (let size = 1; size <= Math.floor(value.length / 2); size += 1) {
    if (value.length % size !== 0) {
      continue;
    }

    const chunk = value.slice(0, size);
    if (chunk.repeat(value.length / size) === value) {
      return true;
    }
  }

  return false;
};

const hasSequence = (value: string, minRun = 5) => {
  if (value.length < minRun) {
    return false;
  }

  for (let start = 0; start <= value.length - minRun; start += 1) {
    const chunk = value.slice(start, start + minRun);
    if (
      SEQUENCE_SOURCES.some(
        (source) => source.includes(chunk) || source.split('').reverse().join('').includes(chunk)
      )
    ) {
      return true;
    }
  }

  return false;
};

const getCharacterTypeCount = (value: string) => {
  let count = 0;
  if (/[a-z]/.test(value)) count += 1;
  if (/[A-Z]/.test(value)) count += 1;
  if (/[0-9]/.test(value)) count += 1;
  if (/[^0-9A-Za-z]/.test(value)) count += 1;
  return count;
};

export interface PasswordRequirement {
  id: 'length' | 'personal' | 'pattern' | 'match';
  label: string;
  passed: boolean;
}

export interface PasswordPolicyEvaluation {
  isValid: boolean;
  errors: string[];
  requirements: PasswordRequirement[];
  strengthLabel: string;
  strengthLevel: 0 | 1 | 2 | 3;
  strengthWidth: `${number}%`;
}

interface EvaluatePasswordPolicyInput {
  password: string;
  confirmPassword?: string;
  email?: string;
  displayName?: string;
}

export const evaluatePasswordPolicy = ({
  password,
  confirmPassword = '',
  email,
  displayName,
}: EvaluatePasswordPolicyInput): PasswordPolicyEvaluation => {
  const normalizedPassword = normalizeValue(password);
  const personalFragments = collectPersonalFragments(email, displayName);

  const containsPersonalInfo = normalizedPassword
    ? personalFragments.some((fragment) => normalizedPassword.includes(fragment))
    : false;
  const usesCommonPattern = normalizedPassword
    ? COMMON_PASSWORDS.has(normalizedPassword) ||
      new Set(normalizedPassword).size === 1 ||
      isRepeatedChunk(normalizedPassword) ||
      hasSequence(normalizedPassword)
    : false;

  const meetsLength = password.length >= PASSWORD_MIN_LENGTH;
  const avoidsPersonalInfo = !!password && !containsPersonalInfo;
  const avoidsCommonPattern = !!password && !usesCommonPattern;
  const confirmMatches = !!confirmPassword && password === confirmPassword;

  const errors: string[] = [];
  if (!meetsLength) {
    errors.push(`비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`);
  }
  if (!avoidsPersonalInfo) {
    errors.push('이메일이나 닉네임이 포함된 비밀번호는 사용할 수 없습니다.');
  }
  if (!avoidsCommonPattern) {
    errors.push('12345, qwerty, 반복 문자 같은 쉬운 비밀번호는 사용할 수 없습니다.');
  }
  if (!confirmMatches) {
    errors.push('비밀번호 확인이 일치하지 않습니다.');
  }

  let score = 0;
  if (meetsLength) score += 1;
  if (password.length >= PASSWORD_MIN_LENGTH + 4) score += 1;
  if (getCharacterTypeCount(password) >= 2) score += 1;
  if (getCharacterTypeCount(password) >= 3) score += 1;
  if (avoidsPersonalInfo) score += 1;
  if (avoidsCommonPattern) score += 1;

  if (!meetsLength || !avoidsPersonalInfo || !avoidsCommonPattern) {
    score = Math.min(score, 3);
  }

  let strengthLevel: 0 | 1 | 2 | 3 = 0;
  let strengthLabel = '입력 대기';
  let strengthWidth: `${number}%` = '0%';

  if (password) {
    if (score <= 2) {
      strengthLevel = 1;
      strengthLabel = '낮음';
      strengthWidth = '34%';
    } else if (score <= 4) {
      strengthLevel = 2;
      strengthLabel = '보통';
      strengthWidth = '68%';
    } else {
      strengthLevel = 3;
      strengthLabel = '높음';
      strengthWidth = '100%';
    }
  }

  return {
    isValid: meetsLength && avoidsPersonalInfo && avoidsCommonPattern && confirmMatches,
    errors,
    requirements: [
      { id: 'length', label: `최소 ${PASSWORD_MIN_LENGTH}자 이상`, passed: meetsLength },
      { id: 'personal', label: '이메일이나 닉네임이 포함되면 안 됩니다.', passed: avoidsPersonalInfo },
      { id: 'pattern', label: '12345, qwerty, aaaaaa 같은 쉬운 패턴은 사용할 수 없습니다.', passed: avoidsCommonPattern },
      { id: 'match', label: '비밀번호 확인이 일치해야 합니다.', passed: confirmMatches },
    ],
    strengthLabel,
    strengthLevel,
    strengthWidth,
  };
};
