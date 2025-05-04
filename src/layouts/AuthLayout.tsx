// src/layouts/AuthLayout.tsx
// Corrected: Using an explicit interface for props including children.

import React from 'react'; // Ensure React is imported
import { Link } from "react-router-dom";

// Explicitly define the props interface
interface AuthLayoutProps {
  children: React.ReactNode; // Define the children prop type
}

// Use the interface to type the component's props
const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-navy-50 to-white flex flex-col">
      <header className="container mx-auto py-6">
        <div className="flex justify-center">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-serif text-3xl font-bold text-navy-900 tracking-tight">
              CoHaven
            </span>
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Children are rendered here */}
          {children}
        </div>
      </div>

      <footer className="py-6 text-center text-sm text-navy-500">
        <div className="container mx-auto">
          © {new Date().getFullYear()} CoHaven. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default AuthLayout;