import { useRef, useState } from 'react';
import { Banner, Button, Card, Form } from '@douyinfe/semi-ui';
import { IconComponent } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useLoginMutation, useMfaLoginMutation, useGetCaptchaQuery, useGetLoginSettingQuery } from '@/api/authApi';
import { setCredentials } from '@/features/auth/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { brandColor, getTokens } from '@/theme';
import { useResolvedMode } from '@/utils/useResolvedMode';

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
    const themeMode = useAppSelector((s) => s.ui.themeMode);
    const resolvedMode = useResolvedMode(themeMode);
    const tokens = getTokens(resolvedMode);
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

    const onSubmit = async (values: LoginForm) => {
        if (submitting.current) return;
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
        <div
            style={{
                minHeight: '100vh',
                display: 'grid',
                placeItems: 'center',
                padding: 16,
                background:
                    resolvedMode === 'dark'
                        ? `radial-gradient(1200px 600px at 20% 0%, rgba(122,198,182,0.18), transparent), ${tokens.backgroundDefault}`
                        : `radial-gradient(1200px 600px at 20% 0%, rgba(53,125,115,0.14), transparent), ${tokens.backgroundDefault}`,
            }}
        >
            <Card style={{ width: '100%', maxWidth: 400 }} bodyStyle={{ padding: 28 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                    <div
                        style={{
                            width: 46,
                            height: 46,
                            borderRadius: 14,
                            display: 'grid',
                            placeItems: 'center',
                            color: '#fff',
                            background: brandColor,
                        }}
                    >
                        <IconComponent size="large" />
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{t('login.title')}</div>
                    <div style={{ fontSize: 13, color: 'var(--semi-color-text-2)', textAlign: 'center' }}>
                        {t('login.subtitle')}
                    </div>
                </div>

                {error && <Banner type="danger" description={error} closeIcon={null} style={{ marginBottom: 16 }} />}

                <Form onSubmit={onSubmit} labelPosition="top" initValues={{ name: '', password: '' }}>
                    {!mfaSession && <>
                    <Form.Input
                        field="name"
                        label={t('login.username')}
                        autoFocus
                        autoComplete="username"
                        rules={[{ required: true, message: t('login.usernameRequired') }]}
                    />
                    <Form.Input
                        field="password"
                        label={t('login.password')}
                        mode="password"
                        autoComplete="current-password"
                        rules={[{ required: true, message: t('login.passwordRequired') }]}
                    />
                    </>}
                    {needCaptcha && <>
                        {captcha.isError ? <Button onClick={() => captcha.refetch()}>重试验证码 / Retry captcha</Button> : null}
                        {captcha.data ? <button type="button" aria-label="刷新验证码 / Refresh captcha" onClick={() => captcha.refetch()} style={{ border: 0, background: 'transparent' }}><img src={captcha.data.imagePath} alt="验证码 / Captcha" /></button> : null}
                        <Form.Input field="captcha" label="验证码 / Captcha" autoComplete="off" rules={[{ required: true }]} />
                    </>}
                    {mfaSession && <Form.Input field="code" label="动态验证码 / Authenticator code" autoComplete="one-time-code" rules={[{ required: true }]} />}
                    <Button htmlType="submit" theme="solid" type="primary" block loading={isLoading || mfaLoading} disabled={needCaptcha && (!captcha.data || captcha.isFetching)} style={{ marginTop: 8 }}>
                        {t('login.submit')}
                    </Button>
                </Form>
                {mfaSession && <Button onClick={() => { setMfaSession(''); setError(''); }}>返回登录 / Back to login</Button>}
            </Card>
            <div style={{ position: 'fixed', bottom: 16, fontSize: 12, color: 'var(--semi-color-text-2)' }}>{t('login.footer')}</div>
        </div>
    );
}
