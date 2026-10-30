import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout, AuthorLayout, RequireRole } from './components/Shell';
import { Button, Spinner } from './components/ui';
import Login from './pages/Login';

// Route-level code splitting keeps the first load small.
const Dashboard = lazy(() => import('./pages/author/Dashboard'));
const Books = lazy(() => import('./pages/author/Books'));
const NewTicket = lazy(() => import('./pages/author/NewTicket'));
const MyTickets = lazy(() => import('./pages/author/MyTickets'));
const AuthorTicketDetail = lazy(() => import('./pages/author/TicketDetail'));
const Queue = lazy(() => import('./pages/admin/Queue'));
const AdminTicketDetail = lazy(() => import('./pages/admin/TicketDetail'));
const AiUsagePage = lazy(() => import('./pages/admin/AiUsage'));

const Loading = () => (
  <div className="grid min-h-[40vh] place-items-center">
    <Spinner className="size-7" />
  </div>
);

function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="font-serif text-6xl font-semibold text-brand-600">404</p>
        <h1 className="mt-2 text-2xl font-semibold">This page doesn&apos;t exist</h1>
        <p className="mt-1 text-muted">The link may be broken or the page may have moved.</p>
        <Link to="/" className="mt-5 inline-block">
          <Button>Back to home</Button>
        </Link>
      </div>
    </div>
  );
}

/** Swagger UI lives on the server; this keeps it one click from the admin console. */
function ApiDocsRedirect() {
  window.location.replace('/api/docs');
  return <Loading />;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <RequireRole role="author">
              <AuthorLayout />
            </RequireRole>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="books" element={<Books />} />
          <Route path="tickets" element={<MyTickets />} />
          <Route path="tickets/new" element={<NewTicket />} />
          <Route path="tickets/:ticketId" element={<AuthorTicketDetail />} />
        </Route>

        <Route
          path="admin"
          element={
            <RequireRole role="admin">
              <AdminLayout />
            </RequireRole>
          }
        >
          <Route index element={<Queue />} />
          <Route path="tickets/:ticketId" element={<AdminTicketDetail />} />
          <Route path="ai" element={<AiUsagePage />} />
          <Route path="docs" element={<ApiDocsRedirect />} />
        </Route>

        <Route path="/index.html" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
