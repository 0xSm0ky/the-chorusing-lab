"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LogIn,
  UserPlus,
  Upload,
  Library,
  Scissors,
} from "lucide-react";
import { AuthModal } from "@/components/auth/AuthModal";
import { UserMenu } from "@/components/auth/UserMenu";
import { UploadModal } from "@/components/upload/UploadModal";
import { useAuth } from "@/lib/auth";

export function HomeAuthHeader() {
  // No authentication required, show all features
  return (
    <>
      <Link
        href="/library"
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        <Library className="w-4 h-4" />
        Clip Library
      </Link>
      <Link
        href="/clip-creator"
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        <Scissors className="w-4 h-4" />
        Clip Creator
      </Link>
      <button
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        <Upload className="w-4 h-4" />
        Upload Clip
      </button>
    </>
  );
}

export function HomeHeroCTAs() {
  // No authentication required, show CTAs to everyone
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 font-medium"
      >
        Chorus for Free!
      </button>
      <Link
        href="/library"
        className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 font-medium"
      >
        Explore Library
      </Link>
    </div>
  );
}

export default HomeAuthHeader;
