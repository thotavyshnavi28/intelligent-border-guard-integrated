import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RadioTower, Settings2, ShieldCheck, Users, LogOut, CheckCircle2, XCircle } from "lucide-react";
import { Panel, Shell, StatusDot } from "@/components/sentinel/Shell";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useFusionSimulation } from "@/hooks/useFusionSimulation";
import { getCurrentUser, getUsers, setUserActive, clearAccessToken, type UserProfile } from "@/services/api";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "System Settings — Border Sentinel" },
      { name: "description", content: "Configure shared prototype simulation mode and multi-sensor confirmation threshold." },
      { property: "og:title", content: "System Settings — Border Sentinel" },
      { property: "og:description", content: "Shared simulation and target confirmation settings for the Border Sentinel academic prototype." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { frame, running, setRunning, mode, setMode, threshold, setThreshold } = useFusionSimulation();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [userError, setUserError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then((user) => {
        setCurrentUser(user);
        if (user && user.role === "admin") {
          getUsers()
            .then(setUsersList)
            .catch((e) => setUserError(e.message));
        }
      })
      .catch(() => {
        // Not authenticated or error
      });
  }, []);

  const handleToggleUser = async (user: UserProfile) => {
    try {
      const updated = await setUserActive(user.id, !user.is_active);
      setUsersList((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: updated.is_active } : u))
      );
      setActionNotice(`User ${user.email} updated to ${updated.is_active ? "Active" : "Inactive"}`);
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      setUserError(err.message || "Failed to update user status");
      setTimeout(() => setUserError(null), 4000);
    }
  };

  const handleLogout = async () => {
    clearAccessToken();
    await navigate({ to: "/login" });
  };

  return (
    <Shell moduleTitle="System Settings" moduleSubtitle="Prototype Configuration">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2 className="font-display text-lg font-bold uppercase tracking-widest">System Settings</h2>
            <p className="mt-1 text-[9px] uppercase tracking-widest text-muted-foreground">
              Changes apply to all modules sharing the simulated sensor feed
            </p>
          </div>
          {currentUser && (
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] text-muted-foreground">
                Operator: <span className="text-foreground">{currentUser.email}</span> ({currentUser.role})
              </span>
              <Button size="sm" variant="secondary" onClick={handleLogout} className="gap-1.5 uppercase text-[9px]">
                <LogOut className="size-3.5" /> Sign Out
              </Button>
            </div>
          )}
        </div>

        {actionNotice && (
          <p className="border border-online/50 bg-online/5 px-3 py-2 text-[9px] uppercase tracking-widest text-online">
            {actionNotice}
          </p>
        )}
        {userError && (
          <p className="border border-critical/50 bg-critical/5 px-3 py-2 text-[9px] uppercase tracking-widest text-critical">
            {userError}
          </p>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Simulation State" icon={RadioTower}>
            <div className="flex items-center justify-between gap-3 border border-border bg-card p-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest">Shared sensor feed</p>
                <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                  {frame.tracks.length} targets · all modules
                </p>
              </div>
              <span className={`flex items-center gap-2 text-[9px] uppercase ${running ? "text-online" : "text-warning"}`}>
                <StatusDot tone={running ? "online" : "warning"} />
                {running ? "Running" : "Paused"}
              </span>
            </div>
            <Button
              className="mt-3 w-full uppercase tracking-widest"
              variant={running ? "secondary" : "default"}
              onClick={() => setRunning(!running)}
            >
              {running ? "Pause shared simulation" : "Resume shared simulation"}
            </Button>
          </Panel>

          <Panel title="Fusion Parameters" icon={Settings2}>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Target confirmation threshold</p>
            <p className="mt-2 font-display text-2xl font-bold">{threshold}%</p>
            <Slider
              aria-label="Fusion confidence threshold"
              className="mt-3"
              min={50}
              max={95}
              step={1}
              value={[threshold]}
              onValueChange={(value) => setThreshold(value[0] ?? threshold)}
            />
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-[9px] uppercase tracking-widest text-muted-foreground">Simulation update mode</p>
              <div className="grid grid-cols-2 gap-2">
                {(["auto", "manual"] as const).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={mode === value ? "default" : "secondary"}
                    className="uppercase"
                    onClick={() => setMode(value)}
                  >
                    {value}
                  </Button>
                ))}
              </div>
            </div>
          </Panel>
        </div>

        {/* User Management */}
        <Panel title="User & Operator Management" icon={Users} right={currentUser ? <span className="font-mono text-muted-foreground">{currentUser.role.toUpperCase()} ACCESS</span> : null}>
          {currentUser?.role === "admin" ? (
            <div className="space-y-3">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                Registered platform operators and administrator credentials
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[540px] text-left font-mono text-[9px]">
                  <thead className="bg-panel-header text-[8px] uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="py-2 px-2">ID</th>
                      <th>Full Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.map((u) => (
                      <tr key={u.id} className="border-b border-border/60">
                        <td className="py-2 px-2 text-foreground">{u.id}</td>
                        <td>{u.full_name}</td>
                        <td className="text-primary">{u.email}</td>
                        <td className="uppercase">{u.role}</td>
                        <td>
                          <span className={`inline-flex items-center gap-1 ${u.is_active ? "text-online" : "text-critical"}`}>
                            {u.is_active ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                            {u.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          {u.id !== currentUser.id ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[8px] uppercase"
                              onClick={() => handleToggleUser(u)}
                            >
                              {u.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          ) : (
                            <span className="text-[8px] text-muted-foreground uppercase">(Current Account)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-3 text-[9px] font-mono text-muted-foreground space-y-2">
              <p>Signed in as: <span className="text-foreground">{currentUser?.email || "Operator"}</span> ({currentUser?.role || "operator"})</p>
              <p>Administrator privileges are required to view and modify other operator accounts.</p>
            </div>
          )}
        </Panel>

        <Panel title="Prototype Notice" icon={ShieldCheck}>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            These settings adjust a simulated academic demonstration. The fusion threshold controls target confirmation only;
            it is not a threat threshold and does not initiate an operational response. Assessment classifications are intended
            for human review.
          </p>
        </Panel>
      </div>
    </Shell>
  );
}
