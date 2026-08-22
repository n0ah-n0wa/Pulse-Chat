import { createBrowserRouter } from 'react-router-dom';

import { AppShell } from '../components/AppShell';
import { ChatLayout } from '../components/chat/ChatLayout';
import { GuestRoute } from '../components/GuestRoute';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { RouteErrorPage } from '../components/RouteErrorPage';
import { ChatHomePage } from '../pages/ChatHomePage';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ProfilePage } from '../pages/ProfilePage';
import { RegisterPage } from '../pages/RegisterPage';
import { RoomPage } from '../pages/RoomPage';
import { SettingsPage } from '../pages/SettingsPage';

export const appRouter = createBrowserRouter([
  {
    path: '/',
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            index: true,
            element: <HomePage />,
          },
          {
            element: <GuestRoute />,
            children: [
              {
                path: 'login',
                element: <LoginPage />,
              },
              {
                path: 'register',
                element: <RegisterPage />,
              },
            ],
          },
          {
            path: 'profile/:username',
            element: <ProfilePage />,
          },
          {
            element: <ProtectedRoute />,
            children: [
              {
                path: 'settings',
                element: <SettingsPage />,
              },
            ],
          },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: 'app',
            element: <ChatLayout />,
            children: [
              {
                index: true,
                element: <ChatHomePage />,
              },
              {
                path: 'rooms/:roomId',
                element: <RoomPage />,
              },
            ],
          },
        ],
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
