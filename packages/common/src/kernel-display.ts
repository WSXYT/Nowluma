// The compat kernel runs the supplied native components of the upstream source
// project, so the console names it after that project; the product stays
// Nowluma. This browser-safe leaf is the one owner of that display name: the
// backend catalog, the DEMO catalog and the console copy all read it here.
export const NATIVE_KERNEL_LABEL = 'SnowLuma 内核';
export const NATIVE_KERNEL_LABEL_EN = `${NATIVE_KERNEL_LABEL.replace(/ 内核$/, '')} kernel`;

export const COMPAT_RISK_VERSION = 'compat-risk-1';

export const COMPAT_RISK_TEXT = `${NATIVE_KERNEL_LABEL}使用随包提供的原生组件，可能存在账号、数据安全与法律风险。请阅读相关说明，由用户主动确认使用与法律风险；确认不免除依法不可免除的责任，也不改变 GPL 源码许可。`;
export const COMPAT_RISK_TEXT_EN = `The ${NATIVE_KERNEL_LABEL_EN} uses the bundled native components, which may pose account, data security, and legal risks. Read the relevant notices and explicitly acknowledge the risks of use and the legal risks. Acknowledgment does not waive liability that cannot be waived by law or change the GPL license for the source code.`;

export const REWRITE_KERNEL_LABEL = '重写内核';
export const REWRITE_KERNEL_UNAVAILABLE_REASON = '当前平台的重写内核尚未验证，暂不可使用';

export function kernelDisplayCatalog() {
    return {
        options: [
            { id: 'compat' as const, label: NATIVE_KERNEL_LABEL, available: true, reason: '' },
            {
                id: 'rewrite' as const,
                label: REWRITE_KERNEL_LABEL,
                available: false,
                reason: REWRITE_KERNEL_UNAVAILABLE_REASON,
            },
        ],
        riskVersion: COMPAT_RISK_VERSION,
        riskText: COMPAT_RISK_TEXT,
    };
}
