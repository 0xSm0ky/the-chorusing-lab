"use client";

// ============================================
// AUTHENTICATION - LOCAL MODE
// ============================================
// This project runs completely offline without any cloud dependencies.
// All data is stored locally on your PC.
//
// Default credentials:
//   Email: test@example.com
//   Password: password123
//
// You can also register new accounts - they're stored in localStorage.
// ============================================

// Re-export everything from local auth
export { AuthProvider, useAuth } from './auth-local';
