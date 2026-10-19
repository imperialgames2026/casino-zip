import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';

// The legacy Base44 support-chat subscription has been replaced by a link to
// the authenticated Supabase ticket system. No user data is sent on render.
export default function SupportChatWidget() {
  const { pathname } = useLocation();
  if (pathname === '/Support' || pathname === '/AdminSupport') return null;
  return <Link
    to="/Support"
    aria-label="Open Imperial Games support"
    className="fixed bottom-20 right-5 z-40 flex items-center gap-2 rounded-full bg-pink-600 px-4 py-3 text-white shadow-xl hover:bg-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-200"
  >
    <MessageCircle className="h-5 w-5" />
    <span className="text-sm font-semibold">Support</span>
  </Link>;
}
