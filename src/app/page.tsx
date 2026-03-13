import Link from "next/link";
import {
  AudioLines,
  LogIn,
  UserPlus,
  Upload,
  Library,
  Mic,
  Activity,
  Zap,
  BookOpen,
  Scissors,
} from "lucide-react";
import { HomeAuthHeader, HomeHeroCTAs } from "@/components/HomeAuthArea";

export default function HomePage() {

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header with Auth */}
      <header className="p-4 bg-white/80 backdrop-blur-sm border-b border-gray-200/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AudioLines className="w-8 h-8 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-900">Chorus Lab</h1>
          </div>

          <div className="flex items-center gap-3">
            <HomeAuthHeader />
          </div>
        </div>
      </header>

      <div className="p-4">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12 mt-8">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Master Languages Through Chorusing
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-6">
              Practice pronunciation and listening skills with short audio
              clips. Repeat, perfect, and progress through the most effective
              language learning technique.
            </p>

            <HomeHeroCTAs />
          </div>

          {/* Content Sections */}
          <div>
            <>
              {/* What is Chorusing */}
              <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <BookOpen className="w-6 h-6 text-indigo-600" />
                  What is Chorusing?
                </h2>

                <div className="grid md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Mic className="w-8 h-8 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Listen</h3>
                    <p className="text-gray-600">
                      Play short audio clips (2-10 seconds) from native speakers
                    </p>
                  </div>

                  <div className="text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Activity className="w-8 h-8 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Repeat</h3>
                    <p className="text-gray-600">
                      Practice along with the audio to match rhythm and
                      pronunciation
                    </p>
                  </div>

                  <div className="text-center">
                    <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Zap className="w-8 h-8 text-purple-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Master</h3>
                    <p className="text-gray-600">
                      Develop natural pronunciation and listening comprehension
                    </p>
                  </div>
                </div>

                <div className="mt-8 p-6 bg-indigo-50 rounded-lg border border-indigo-200">
                  <h4 className="font-semibold text-indigo-900 mb-2">
                    Why Chorusing Works
                  </h4>
                  <p className="text-indigo-800">
                    By practicing with short, focused clips, you train your ear
                    and mouth together. This technique helps you internalize the
                    natural rhythm, stress patterns, and pronunciation of your
                    target language more effectively than traditional methods.
                  </p>
                </div>
              </div>

              {/* Getting Started */}
              <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                  Getting Started
                </h2>

                <div className="grid md:grid-cols-3 gap-6">
                  <div className="text-center p-6 border border-gray-200 rounded-lg">
                    <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                      <UserPlus className="w-6 h-6 text-indigo-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">1. Sign Up</h3>
                    <p className="text-gray-600 text-sm mb-4">Create your free account to get started</p>
                    <Link href="/register" className="w-full inline-block px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm text-center">Create Account</Link>
                  </div>

                  <div className="text-center p-6 border border-gray-200 rounded-lg">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                      <Upload className="w-6 h-6 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">2. Upload Clips</h3>
                    <p className="text-gray-600 text-sm">Add short audio clips to practice with</p>
                    <Link href="/upload" className="w-full inline-block mt-3 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-center">Upload</Link>
                  </div>

                  <div className="text-center p-6 border border-gray-200 rounded-lg">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                      <Mic className="w-6 h-6 text-purple-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">3. Start Practicing</h3>
                    <p className="text-gray-600 text-sm">Listen, repeat, and improve your pronunciation</p>
                    <Link href="/library" className="w-full inline-block mt-3 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-center">Browse Library</Link>
                  </div>
                </div>
              </div>
            </>
          </div>
        </div>
      </div>

    </main>
  );
}
