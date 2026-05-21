/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const demoUsers = [
  { label: "Demo User A", email: "demo.a@example.test", password: "Challenge123!" },
  { label: "Demo User B", email: "demo.b@example.test", password: "Challenge123!" },
  { label: "Demo User C", email: "demo.c@example.test", password: "Challenge123!" },
];

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState(demoUsers[0].email);
  const [password, setPassword] = useState(demoUsers[0].password);
  const [loading, setLoading] = useState(false);

  const signIn = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Sign in failed",
        description: err.message || "Check that Supabase has been reset with the challenge seed.",
      });
    } finally {
      setLoading(false);
    }
  };

  const signInAs = async (demo: (typeof demoUsers)[number]) => {
    setEmail(demo.email);
    setPassword(demo.password);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: demo.email,
        password: demo.password,
      });
      if (error) throw error;
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Demo sign in failed",
        description: err.message || "Run supabase db reset to seed the demo users.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Technical Challenge Demo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={signIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <div className="grid gap-2">
            {demoUsers.map((demo) => (
              <Button
                key={demo.email}
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => signInAs(demo)}
              >
                Use {demo.label}
              </Button>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            This branch uses local synthetic accounts only. LinkedIn OAuth and paid AI APIs are disabled.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
