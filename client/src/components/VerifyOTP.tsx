import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { verifyOtp, resendOtp } from '../services/api';

const VerifyOTP: React.FC = () => {
  const [otp, setOtp] = useState<string[]>(new Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  const location = useLocation();
  const navigate = useNavigate();

  const [email] = useState(() => {
    return location.state?.email || sessionStorage.getItem('pending_verification_email') || "";
  });

  useEffect(() => {
    if (location.state?.email) {
      sessionStorage.setItem('pending_verification_email', location.state.email);
    }
    
    // If no email is found in state OR storage, send them back
    if (!email) {
      navigate('/login');
    }
  }, [email, navigate, location.state]);

  const handleChange = (element: HTMLInputElement, index: number) => {
    if (isNaN(Number(element.value))) return false;

    setOtp([...otp.map((d, idx) => (idx === index ? element.value : d))]);

    // Auto-focus next input
    if (element.value !== "" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Allow pasting the whole 6-digit code into any box (CMP-M20).
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    const next = new Array(6).fill("");
    for (let i = 0; i < digits.length; i++) next[i] = digits[i];
    setOtp(next);
    inputRefs.current[Math.min(digits.length, 5)]?.focus();
  };

  // Leak-free resend countdown: one timer per tick, cleared on unmount/change
  // (previously a setInterval in the click handler was only cleared at zero).
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const otpString = otp.join("");
      await verifyOtp(email, otpString);
      
      // Success: Redirect to login
      sessionStorage.removeItem('pending_verification_email');
      navigate('/login', { state: { message: "ACCOUNT_VERIFIED_ACCESS_GRANTED" } });
    } catch (err: any) {
      setError(err.message || "INVALID_VERIFICATION_CODE");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    try {
      setError("");
      await resendOtp(email);
      setResendCooldown(60); // the countdown effect handles ticking + cleanup
    } catch (err: any) {
      setError(err.message || "RESEND_FAILED");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="starfield" />

      <div className="max-w-md w-full glass glass-blur rounded-2xl p-8 relative z-10 overflow-hidden">
        <div className="flex justify-between items-center mb-8">
          <h2 className="font-display font-bold text-3xl text-app-text tracking-tight">Identity check</h2>
          <span className="text-[10px] bg-surface-2 border border-app-border text-app-muted rounded-lg px-2 py-1">v2.0</span>
        </div>

        <p className="text-xs text-app-muted mb-8 leading-relaxed">
          A verification code has been sent to: <br/>
          <span className="text-app-text font-semibold">{email}</span>
        </p>

        <form onSubmit={handleVerify} className="space-y-8">
          <div className="flex justify-between gap-2">
            {otp.map((data, index) => (
              <input
                key={index}
                type="text"
                maxLength={1}
                ref={(el) => (inputRefs.current[index] = el)}
                value={data}
                onChange={(e) => handleChange(e.target, index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                onPaste={handlePaste}
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label={`Verification digit ${index + 1}`}
                className="w-full h-14 bg-surface-2 border border-app-border rounded-xl text-center text-2xl text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
              />
            ))}
          </div>

          {error && (
            <div role="alert" aria-live="assertive" className="bg-danger/10 border border-danger/30 text-danger rounded-xl p-3 text-xs font-medium">
              Error: {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || otp.join("").length < 6}
            className="w-full bg-primary text-on-primary font-semibold text-sm py-4 rounded-xl shadow-glow hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Verifying…" : "Verify identity"}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-app-border text-center space-y-1.5">
          <p className="text-[11px] text-app-faint">
            Didn't receive the code?
            <button
              onClick={handleResendOtp}
              disabled={resendCooldown > 0}
              className="ml-2 text-primary hover:brightness-125 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
          </p>
          <p className="text-[11px] text-app-faint">
            Wrong account?
            <button
            onClick={() => navigate('/login')}
            className="ml-2 text-app-text hover:text-primary font-semibold transition-colors"
            >
            Return to login
            </button>
        </p>
        </div>
      </div>
    </div>
  );
};

export default VerifyOTP;