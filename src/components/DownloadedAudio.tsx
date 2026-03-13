"use client";
import React, { useEffect, useState } from "react";

export default function DownloadedAudio() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
  const res = await fetch("/api/local-downloads");
      const json = await res.json();
      setFiles(json.files || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function importFile(filename: string) {
    if (!confirm(`Import ${filename} into clips?`)) return;
    await fetch("/api/local-downloads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename }),
    });
    await load();
  }

  async function cleanupAll() {
    if (!confirm("Delete all downloaded files?")) return;
    await fetch("/api/local-downloads?all=1", { method: "DELETE" });
    await load();
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(filename: string) {
    if (!confirm(`Delete ${filename}?`)) return;
  await fetch("/api/local-downloads", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename }),
    });
    await load();
  }

  function selectFile(file: any) {
    const url = `/clip-creator?file=${encodeURIComponent(file.filename)}`;
    window.location.href = url;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1 bg-indigo-600 text-white rounded-md"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
        <button onClick={cleanupAll} className="px-3 py-1 bg-red-600 text-white rounded-md">Delete all</button>
      </div>

      {files.length === 0 && <div className="text-sm text-gray-600">No saved audio</div>}

      <ul className="space-y-3 mt-3">
        {files.map((f) => (
          <li key={f.filename} className="p-3 bg-white rounded-md border border-gray-200 flex items-start gap-3">
            <div className="flex-1">
              <div className="font-medium">{f.filename}</div>
              <div className="text-xs text-gray-500">{(f.size / 1024).toFixed(1)} KB • {new Date(f.mtime).toLocaleString()}</div>
              <audio controls src={f.url} className="w-full mt-2" />
            </div>
              <div className="flex flex-col gap-2">
              <button onClick={() => selectFile(f)} className="px-3 py-1 bg-green-500 text-white rounded-md">Make clip</button>
              <button onClick={() => importFile(f.filename)} className="px-3 py-1 bg-indigo-600 text-white rounded-md">Import</button>
              <button onClick={() => remove(f.filename)} className="px-3 py-1 bg-red-500 text-white rounded-md">Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
