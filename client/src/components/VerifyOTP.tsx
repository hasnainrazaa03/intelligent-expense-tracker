import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

const VerifyOTP: React.FC = () => {
  const [otp, setOtp] = useState<string[]>(new Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  const navigate = useNavigate();
  const location = useLocation();
  
  // Retrieve email passed from the Register component
  const email = location.state?.email || "";

  useEffect(() => {
    if (!email) {
      navigate('/register'); // Kick back if no email context exists
    }
  }, [email, navigate]);

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

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const otpString = otp.join("");
      await axios.post(`${import.meta.env.VITE_API_BASE_URL}/auth/verify-otp`, {
        email,
        otp: otpString
      });
      
      // Success: Redirect to login
      navigate('/login', { state: { message: "ACCOUNT_VERIFIED_ACCESS_GRANTED" } });
    } catch (err: any) {
      setError(err.response?.data?.message || "INVALID_VERIFICATION_CODE");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bone flex items-center justify-center p-4 font-loud">
      <div className="max-w-md w-full bg-white border-8 border-ink shadow-neo p-8 relative overflow-hidden">
        {/* Decorative Technical Header */}
        <div className="absolute top-0 left-0 w-full bg-usc-cardinal h-2" />
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl text-ink uppercase tracking-tighter">Identity_Check</h2>
          <span className="text-[10px] bg-ink text-bone px-2 py-1">V_2.0</span>
        </div>

        <p className="text-xs text-ink/60 mb-8 uppercase leading-tight">
          A verification dispatch has been sent to: <br/>
          <span className="text-usc-cardinal font-bold">{email}</span>
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
                className="w-full h-14 border-4 border-ink text-center text-2xl font-loud focus:bg-usc-gold focus:outline-none transition-colors shadow-[4px_4px_0px_0px_#111111]"
              />
            ))}
          </div>

          {error && (
            <div className="bg-usc-cardinal/10 border-2 border-usc-cardinal p-3 text-usc-cardinal text-[10px] uppercase">
              Error_Log: {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || otp.join("").length < 6}
            className="w-full bg-ink text-bone py-4 border-4 border-ink shadow-neo hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase text-sm"
          >
            {loading ? "Processing_Voucher..." : "Verify_Identity"}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t-2 border-dashed border-ink/20 text-center">
          <p className="text-[10px] text-ink/40 uppercase">
            Didn't receive the code? 
            <button className="ml-2 text-usc-cardinal hover:underline font-bold">Request_Resend</button>
          </p>
          <p className="text-[10px] text-ink/40 uppercase">
            Wrong account? 
            <button 
            onClick={() => navigate('/login')} 
            className="ml-2 text-ink hover:text-usc-cardinal hover:underline font-bold underline decoration-usc-gold decoration-2 underline-offset-2"
            >
            Return_to_Login
            </button>
        </p>
        </div>
      </div>
    </div>
  );
};

export default VerifyOTP;