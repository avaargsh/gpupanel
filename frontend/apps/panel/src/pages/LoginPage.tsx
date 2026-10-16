import { useRef, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ComponentIcon, RefreshCwIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useLoginMutation, useMfaLoginMutation, useGetCaptchaQuery, useGetLoginSettingQuery } from '@/api/authApi';
import { setCredentials } from '@/features/auth/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

interface LoginForm {
    name: string;
    password: string;
    captcha?: string;
    code?: string;
}

export default function LoginPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useAppDispatch();
    const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
    const [login, { isLoading }] = useLoginMutation();
    const [mfaLogin, { isLoading: mfaLoading }] = useMfaLoginMutation();
    const [mfaSession, setMfaSession] = useState('');
    const [captchaRequired, setCaptchaRequired] = useState(false);
    const setting = useGetLoginSettingQuery();
    const needCaptcha = !mfaSession && (captchaRequired || Boolean(setting.data?.needCaptcha));
    const captcha = useGetCaptchaQuery(undefined, { skip: !needCaptcha });
    const submitting = useRef(false);
    const [error, setError] = useState('');

    if (isAuthenticated) {
        return <Navigate to="/" replace />;
    }

    const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (submitting.current) return;
        const data = new FormData(event.currentTarget);
        const values: LoginForm = {
            name: String(data.get('name') ?? ''),
            password: String(data.get('password') ?? ''),
        };
        if (data.has('captcha')) values.captcha = String(data.get('captcha') ?? '');
        if (data.has('code')) values.code = String(data.get('code') ?? '');
        if (!mfaSession && (!values.name || !values.password)) {
            setError(values.name ? t('login.passwordRequired') : t('login.usernameRequired'));
            return;
        }
        submitting.current = true;
        setError('');
        try {
            const res = mfaSession
                ? await mfaLogin({ sessionId: mfaSession, code: values.code ?? '' }).unwrap()
                : await login({ ...values, captchaID: captcha.data?.captchaID }).unwrap();
            if (res.mfaStatus === 'Enable' && res.mfaSession) {
                setMfaSession(res.mfaSession);
                return;
            }
            dispatch(setCredentials({ token: res.token, name: res.name, role: res.role }));
            const from = (location.state as { from?: string } | null)?.from ?? '/';
            navigate(from, { replace: true });
        } catch (err) {
            setError((err as { data?: { message?: string } })?.data?.message ?? t('login.failed'));
            if (!mfaSession) {
                setCaptchaRequired(true);
                if (needCaptcha) void captcha.refetch();
                void setting.refetch();
            }
        } finally {
            submitting.current = false;
        }
    };

    return (
        <div className="grid min-h-dvh place-items-center bg-background p-4 [background-image:radial-gradient(1200px_600px_at_20%_0%,color-mix(in_srgb,var(--primary)_16%,transparent),transparent)]">
            <Card className="w-full max-w-[400px] [--card-spacing:28px]">
                <CardContent>
                    <div className="mb-6 flex flex-col items-center gap-2">
                        <div className="grid size-[46px] place-items-center rounded-[14px] bg-primary text-primary-foreground">
                            <ComponentIcon className="size-5" />
                        </div>
                        <div className="text-lg font-bold">{t('login.title')}</div>
                        <div className="text-center text-[13px] text-muted-foreground">
                            {t('login.subtitle')}
                        </div>
                    </div>

                    {error && <Alert variant="destructive" className="mb-4 border-destructive/40 bg-destructive/10">{error}</Alert>}

                    <form onSubmit={onSubmit}>
                        <FieldGroup>
                            {!mfaSession && <>
                            <Field>
                                <FieldLabel htmlFor="login-name">{t('login.username')}</FieldLabel>
                                <Input
                                    id="login-name"
                                    name="name"
                                    required
                                    autoFocus
                                    autoComplete="username"
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="login-password">{t('login.password')}</FieldLabel>
                                <Input
                                    id="login-password"
                                    name="password"
                                    type="password"
                                    required
                                    autoComplete="current-password"
                                />
                            </Field>
                            </>}
                            {needCaptcha && <>
                                {captcha.isError ? <Button type="button" variant="outline" onClick={() => captcha.refetch()}>重试验证码 / Retry captcha</Button> : null}
                                {captcha.data ? <button type="button" aria-label="刷新验证码 / Refresh captcha" onClick={() => captcha.refetch()} style={{ border: 0, background: 'transparent' }}><img src={captcha.data.imagePath} alt="验证码 / Captcha" /></button> : null}
                                <Field>
                                    <FieldLabel htmlFor="login-captcha">验证码 / Captcha</FieldLabel>
                                    <Input id="login-captcha" name="captcha" autoComplete="off" required />
                                </Field>
                            </>}
                            {mfaSession && <Field>
                                <FieldLabel htmlFor="login-code">动态验证码 / Authenticator code</FieldLabel>
                                <Input id="login-code" name="code" autoComplete="one-time-code" required />
                            </Field>}
                        </FieldGroup>
                        <Button type="submit" className="mt-5 w-full" disabled={isLoading || mfaLoading || (needCaptcha && (!captcha.data || captcha.isFetching))}>
                            {(isLoading || mfaLoading) && <Spinner data-icon="inline-start" />}
                            {t('login.submit')}
                        </Button>
                    </form>
                    {mfaSession && <Button type="button" className="mt-3" variant="outline" onClick={() => { setMfaSession(''); setError(''); }}>返回登录 / Back to login</Button>}
                </CardContent>
            </Card>
            <div className="fixed bottom-4 text-xs text-muted-foreground">{t('login.footer')}</div>
        </div>
    );
}
