import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { sendCode, verifyCode } from '../board/cloud';
import { useTurnstile } from '../board/useTurnstile';

function friendly(error: unknown, fallback: string) {
  const status = (error as { status?: number })?.status;
  const message = String((error as { message?: string })?.message ?? '');
  if (status === 429 || /rate limit/i.test(message)) {
    return 'Too many codes sent. Please try again in a few minutes.';
  }
  if (/captcha/i.test(message)) return 'The security check didn’t pass. Please try again.';
  if (/fetch|network/i.test(message)) return 'Can’t reach the server. Check your connection.';
  return fallback;
}

export function SignInDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const captchaBox = useRef<HTMLDivElement>(null);
  const captcha = useTurnstile(captchaBox);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [resent, setResent] = useState(false);

  useLayoutEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
    return () => node?.close();
  }, []);

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setError('That doesn’t look like an email address.');
      return;
    }
    setWorking(true);
    setError('');
    try {
      await sendCode(address, captcha.token);
      setEmail(address);
      setStep('code');
    } catch (reason) {
      setError(friendly(reason, 'Couldn’t send a code. Please try again.'));
    } finally {
      captcha.reset();
      setWorking(false);
    }
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    setError('');
    try {
      await verifyCode(email, code);
      onClose();
    } catch (reason) {
      setError(friendly(reason, 'That code didn’t work. Check it, or send a new one.'));
      setWorking(false);
    }
  };

  const resend = async () => {
    setError('');
    setResent(false);
    try {
      await sendCode(email, captcha.token);
      setResent(true);
    } catch (reason) {
      setError(friendly(reason, 'Couldn’t send a code. Please try again.'));
    } finally {
      captcha.reset();
    }
  };

  return (
    <dialog
      ref={dialog}
      className="confirm auth"
      aria-labelledby="auth-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
      onClose={() => {
        if (!dialog.current?.open) onClose();
      }}
    >
      {step === 'email' ? (
        <form onSubmit={submitEmail} noValidate>
          <h2 id="auth-title">Sign in</h2>
          <p className="confirm-text auth-text">
            We’ll email you a code. Your boards and hours then sync across your devices.
          </p>
          <input
            className="auth-input"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@email.com"
            aria-label="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {error && (
            <p className="tags-error" role="alert">
              {error}
            </p>
          )}
          <div className="confirm-actions auth-actions">
            <button type="button" className="btn btn--soft" onClick={onClose}>
              Not now
            </button>
            <button type="submit" className="btn btn--dark" disabled={working || !email.trim() || !captcha.token}>
              {working ? 'Sending' : 'Send code'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={submitCode}>
          <h2 id="auth-title">Check your email</h2>
          <p className="confirm-text auth-text">Enter the code we sent to {email}.</p>
          <input
            className="auth-input auth-input--code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={8}
            placeholder="Code"
            aria-label="Code from your email"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          />
          {error && (
            <p className="tags-error" role="alert">
              {error}
            </p>
          )}
          {resent && !error && <p className="auth-note">New code sent.</p>}
          <div className="confirm-actions auth-actions">
            <button type="button" className="btn btn--plain auth-resend" disabled={!captcha.token} onClick={resend}>
              Send a new code
            </button>
            <button type="submit" className="btn btn--dark" disabled={working || code.length < 6}>
              {working ? 'Checking' : 'Sign in'}
            </button>
          </div>
        </form>
      )}
      {captcha.failed && (
        <p className="tags-error" role="alert">
          The security check couldn’t load. If you use an ad blocker, allow challenges.cloudflare.com and try again.
        </p>
      )}
      <div ref={captchaBox} className="auth-captcha" />
    </dialog>
  );
}
