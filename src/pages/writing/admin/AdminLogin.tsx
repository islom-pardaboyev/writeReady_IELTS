import { Link, useNavigate } from "react-router";
import { signInWithCustomToken } from "firebase/auth";
import { adminAuth } from "@/firebase/adminConfig";
import { auth } from "@/firebase/config";
import { StaffLogin } from "@/components/staff/StaffLogin";

export function AdminLogin({ onLogin }: { onLogin: (user: string) => void }) {
  const navigate = useNavigate();

  const submit = async (login: string, password: string): Promise<string | null> => {
    try {
      // The server wants the owner's own signed-in session with the password
      // (api/staff-login.ts): this page only opens for that account anyway.
      const ownerToken = await auth.currentUser?.getIdToken().catch(() => null);
      const res = await fetch("/api/staff-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ownerToken ? { Authorization: `Bearer ${ownerToken}` } : {}),
        },
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) return data.error ?? "Too many wrong passwords. Wait 15 minutes and try again.";
        return res.status >= 500
          ? "The sign-in service had a problem. Try again in a minute."
          : "That login or password is not right.";
      }

      await signInWithCustomToken(adminAuth, data.customToken);

      if (data.role === "admin") {
        localStorage.setItem("adminLoggedIn", "true");
        localStorage.setItem("adminUser", login);
        onLogin(login);
        return null;
      }
      if (data.role === "center") {
        localStorage.setItem("centerAdminLoggedIn", "true");
        localStorage.setItem("centerAdminId", data.centerId);
        localStorage.setItem("centerAdminName", data.centerName ?? "Center");
        navigate("/center-admin");
        return null;
      }
      return "That login or password is not right.";
    } catch (e) {
      console.error(e);
      return "Could not reach the server. Check your connection and try again.";
    }
  };

  return (
    <StaffLogin
      title="Admin sign-in"
      description="Manage prompts, users, partners and the site."
      onSubmit={submit}
      footer={
        <p>
          Signing in for a learning center or as a teacher? Use the{" "}
          <Link to="/center-admin" className="font-medium text-[var(--ink-blue)] underline underline-offset-2">learning center portal</Link>{" "}
          or the{" "}
          <Link to="/teacher-portal" className="font-medium text-[var(--ink-blue)] underline underline-offset-2">teacher portal</Link>.
        </p>
      }
    />
  );
}
