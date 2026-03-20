import { useState } from 'react';
import { Outlet } from 'react-router';
import { Menu } from 'lucide-react';
import { Toaster } from 'sonner';
import { Sidebar } from './Sidebar';

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-50 w-64">
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex items-center border-b border-gray-200 bg-white px-4 py-3 md:hidden dark:border-gray-700 dark:bg-gray-800">
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-1 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">
            <Menu className="h-6 w-6" />
          </button>
          <span className="ml-3 text-lg font-bold text-gray-900 dark:text-gray-100">FileMom</span>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>

      <Toaster position="bottom-right" richColors />
    </div>
  );
}
