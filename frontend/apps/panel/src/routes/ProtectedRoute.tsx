import type { ReactNode } from 'react';
import { Banner, Button, Spin } from '@douyinfe/semi-ui';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/store/hooks';
import { useGetCurrentUserQuery } from '@/api/authApi';

/** Cached browser identity is a hint; the server session is checked before mounting privileged views. */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
    const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
    const location = useLocation();
    const session = useGetCurrentUserQuery(undefined, { skip: !isAuthenticated, refetchOnMountOrArgChange: true });
    if (!isAuthenticated) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
    if (session.isFetching) return <Spin />;
    if (session.isError || !session.currentData?.name) return <Banner type="danger" description={<>
        无法验证登录会话 / Cannot verify session <Button onClick={() => session.refetch()}>重试 / Retry</Button>
    </>} />;
    return <>{children}</>;
}
