// src/app/page.tsx

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AppState } from "@/core/types";

/**
 * Main dashboard page showing system health and quick links.
 */
export default async function Home() {
  // Fetch the system health status directly on the server side for initial load
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/health`, { cache: 'no-store' });
  const data = await res.json();

  return (
    <div className="container mx-auto p-8 space-y-10">
      <header className="border-b pb-4 flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Smart Home Hub</h1>
        <Button asChild>
          <Link href="/diagnostics">Diagnostics</Link>
        </Button>
      </header>

      {/* System Health Card */}
      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center space-x-4">
            <div className={`p-3 rounded-full ${data.status === 'ok' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'}`}>
                <span className="font-bold text-xl">{data.status === 'ok' ? 'Online' : 'Offline'}</span>
            </div>
            <div className="flex flex-col">
                <p className="text-sm text-muted-foreground">Last checked:</p>
                <p className="font-medium">{new Date(data.timestamp).toLocaleTimeString()}</p>
            </div>
        </CardContent>
      </Card>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/rooms/living-room">
          <Card className="cursor-pointer hover:shadow-lg transition duration-200">
            <CardHeader>
              <CardTitle>Living Room</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">View all devices in the main living area.</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/pair">
          <Card className="cursor-pointer hover:shadow-lg transition duration-200 border-dashed border-2 border-primary/30">
            <CardHeader>
              <CardTitle>Pair New Device</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Start the guided pairing wizard for new hardware.</p>
            </CardContent>
          </Card>
        </Link>

        <div className="flex items-center justify-center p-4 border rounded-lg bg-gray-50 dark:bg-gray-800/50">
             <Badge variant="secondary" className="text-sm mr-2">Phase 1 Complete</Badge>
             <span className="text-sm text-muted-foreground">Next up: Device Persistence & Room Structure</span>
        </div>
      </div>

    </div>
  );
}