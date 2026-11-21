import { useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import {
    Group,
    Segmented,
    SettingRow,
    SliderSettingRow,
} from '@/components/settings/settings-controls';
import { Button } from '@/components/ui/button';
import { GRADIENT_OPTIONS, type BackgroundType, type useTheme } from '@/contexts/ThemeContext';
import { useT } from '@/i18n';
import { cn, toColorInputValue } from '@/lib/utils';

const BG_TYPE_OPTIONS: { value: BackgroundType; label: [zh: string, en: string] }[] = [
    { value: 'none', label: ['无', 'None'] },
    { value: 'solid', label: ['纯色', 'Solid'] },
    { value: 'gradient', label: ['渐变', 'Gradient'] },
    { value: 'image', label: ['图片', 'Image'] },
];

export function BackgroundCard({
    appearance: a,
    setAppearance,
    uploadBackground,
    removeBackground,
}: {
    appearance: ReturnType<typeof useTheme>['appearance'];
    setAppearance: ReturnType<typeof useTheme>['setAppearance'];
    uploadBackground: ReturnType<typeof useTheme>['uploadBackground'];
    removeBackground: ReturnType<typeof useTheme>['removeBackground'];
}) {
    const t = useT();
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];

        if (fileRef.current) {
            fileRef.current.value = '';
        }

        if (!file) {
            return;
        }

        setUploading(true);
        setErr(null);

        try {
            await uploadBackground(file);
        } catch (ex) {
            setErr(ex instanceof Error ? ex.message : t('上传失败', 'Upload failed'));
        } finally {
            setUploading(false);
        }
    };

    const onRemove = async () => {
        setBusy(true);
        setErr(null);

        try {
            await removeBackground();
        } catch {
            setErr(t('删除失败', 'Removal failed'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Group
            title={t('背景', 'Background')}
            icon={ImageIcon}
            description={t(
                '背景应用于工作区与登录页。',
                'The background applies to the workspace and sign-in page.',
            )}
        >
            <SettingRow label={t('背景类型', 'Background type')}>
                <Segmented
                    value={a.background.type}
                    options={BG_TYPE_OPTIONS.map(({ value, label }) => ({
                        value,
                        label: t(...label),
                    }))}
                    onChange={(type) => setAppearance({ background: { type } })}
                />
            </SettingRow>

            {a.background.type === 'solid' && (
                <SettingRow label={t('背景颜色', 'Background color')}>
                    <div className="flex items-center gap-3">
                        <label
                            className="relative size-11 cursor-pointer overflow-hidden rounded-[4px] border focus-within:ring-2 focus-within:ring-ring"
                            style={{ backgroundColor: a.background.color }}
                        >
                            <input
                                type="color"
                                value={toColorInputValue(a.background.color)}
                                onChange={(e) =>
                                    setAppearance({ background: { color: e.target.value } })
                                }
                                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                aria-label={t('背景颜色', 'Background color')}
                            />
                        </label>
                        <span className="font-mono text-sm text-muted-foreground">
                            {a.background.color}
                        </span>
                    </div>
                </SettingRow>
            )}

            {a.background.type === 'gradient' && (
                <SettingRow label={t('渐变预设', 'Gradient presets')} layout="stack">
                    <div className="flex flex-wrap gap-2">
                        {GRADIENT_OPTIONS.map((g) => {
                            const active = a.background.gradient === g.id;
                            const label = t(g.label, g.labelEn);
                            return (
                                <button
                                    key={g.id}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() =>
                                        setAppearance({ background: { gradient: g.id } })
                                    }
                                    title={label}
                                    aria-label={label}
                                    className={cn(
                                        'inline-flex min-h-11 items-center gap-2 rounded-[4px] border px-3 text-xs transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                        active
                                            ? 'border-foreground'
                                            : 'border-border hover:bg-muted/40',
                                    )}
                                >
                                    <span
                                        aria-hidden="true"
                                        className="h-5 w-8 rounded-[2px] border border-border/60"
                                        style={{ backgroundImage: g.css }}
                                    />
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </SettingRow>
            )}

            {a.background.type === 'image' && (
                <>
                    <SettingRow
                        label={t('壁纸', 'Wallpaper')}
                        hint={t(
                            '支持 PNG / JPEG / WebP，最大 5MB。',
                            'PNG, JPEG, or WebP, up to 5 MB.',
                        )}
                        layout="stack"
                    >
                        <div className="flex flex-wrap items-center gap-3">
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={onFile}
                                className="hidden"
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => fileRef.current?.click()}
                                disabled={uploading}
                            >
                                {uploading ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <Upload className="size-4" />
                                )}
                                {a.background.hasImage
                                    ? t('更换图片', 'Replace image')
                                    : t('上传图片', 'Upload image')}
                            </Button>
                            {a.background.hasImage && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onRemove}
                                    disabled={busy}
                                    className="text-destructive hover:text-destructive"
                                >
                                    <Trash2 className="size-4" /> {t('移除', 'Remove')}
                                </Button>
                            )}
                        </div>
                        {a.background.hasImage && (
                            <div className="max-w-lg overflow-hidden rounded-[4px] border">
                                <img
                                    src={`/ui-asset/background?v=${a.background.imageVersion}`}
                                    alt={t('背景预览', 'Background preview')}
                                    className="h-32 w-full object-cover"
                                />
                            </div>
                        )}
                    </SettingRow>

                    {a.background.hasImage && (
                        <>
                            <SliderSettingRow
                                label={t('遮罩强度', 'Overlay opacity')}
                                hint={t(
                                    '提高遮罩以增加前景可读性。',
                                    'Increase opacity to improve foreground readability.',
                                )}
                                min={0}
                                max={1}
                                step={0.05}
                                value={a.background.imageOpacity}
                                valueLabelFormat={(nextValue) => `${Math.round(nextValue * 100)}%`}
                                onValueChange={(imageOpacity) =>
                                    setAppearance({ background: { imageOpacity } })
                                }
                                aria-valuetext={`${Math.round(a.background.imageOpacity * 100)}%`}
                            />
                            <SliderSettingRow
                                label={t('背景模糊', 'Background blur')}
                                min={0}
                                max={40}
                                step={1}
                                value={a.background.imageBlur}
                                valueLabelFormat={(nextValue) => `${nextValue}px`}
                                onValueChange={(imageBlur) =>
                                    setAppearance({ background: { imageBlur } })
                                }
                                aria-valuetext={t(
                                    `${a.background.imageBlur} 像素`,
                                    `${a.background.imageBlur} px`,
                                )}
                            />
                        </>
                    )}
                </>
            )}

            {err && (
                <p role="alert" className="py-3 text-xs text-destructive">
                    {err}
                </p>
            )}
        </Group>
    );
}
