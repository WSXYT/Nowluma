import { defaultTranslate, type Translate } from '@/i18n';
import { assessAccessToken } from '@nowluma/common/access-token';

export interface AccessTokenFeedback {
    valid: boolean;
    tone: 'success' | 'warning' | 'error';
    message: string;
}

export function accessTokenFeedback(
    token: string,
    userInputs: readonly (string | number)[],
    allowEmpty: boolean,
    t: Translate = defaultTranslate,
): AccessTokenFeedback {
    if (!token) {
        return allowEmpty
            ? {
                  valid: true,
                  tone: 'warning',
                  message: t(
                      '留空将关闭该服务端的鉴权，仅建议在本机使用。',
                      'Leaving the token blank disables authentication. Use this only for local access.',
                  ),
              }
            : {
                  valid: false,
                  tone: 'error',
                  message: t(
                      '未绑定本机地址时，远程访问必须填写令牌；请生成令牌或将主机改为 127.0.0.1。',
                      'Remote access requires a token when the listener is not bound to loopback. Generate a token or set the host to 127.0.0.1.',
                  ),
              };
    }

    const assessment = assessAccessToken(token, userInputs);

    if (assessment.reason === 'too-short') {
        return {
            valid: false,
            tone: 'error',
            message: t(
                '令牌至少需要 16 个字符，请继续补充或重新生成。',
                'Use at least 16 characters or generate a new token.',
            ),
        };
    }

    if (!assessment.acceptable) {
        return {
            valid: false,
            tone: 'error',
            message: t(
                '令牌容易被猜中，请使用右侧按钮生成新的随机令牌。',
                'This token is easy to guess. Use the generate button to create a random token.',
            ),
        };
    }

    return {
        valid: true,
        tone: 'success',
        message: t('令牌强度符合要求。', 'The token meets the strength requirements.'),
    };
}
