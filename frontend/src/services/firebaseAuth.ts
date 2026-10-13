import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type Auth,
  type ConfirmationResult,
} from 'firebase/auth';
import type { PublicAuthConfig } from '../types/auth';
import { firebaseStepUp } from './auth';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let recaptchaVerifier: RecaptchaVerifier | null = null;

function formatE164(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  return `+${cleaned}`;
}

function getFirebaseAuth(config: PublicAuthConfig): Auth {
  if (!app) {
    const firebaseConfig = {
      apiKey: config.firebase_api_key,
      authDomain: config.firebase_auth_domain,
      projectId: config.gcp_project_id,
    };
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
  }
  return auth!;
}

function setupRecaptcha(containerId: string, authInstance: Auth): RecaptchaVerifier {
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch {}
    recaptchaVerifier = null;
  }
  recaptchaVerifier = new RecaptchaVerifier(authInstance, containerId, {
    size: 'invisible',
    callback: () => {
      // reCAPTCHA solved, phone OTP request allowed
    },
    'expired-callback': () => {
      console.warn('reCAPTCHA expired');
    },
  });
  return recaptchaVerifier;
}

async function sendRealPhoneOtp(
  phoneNumber: string,
  config: PublicAuthConfig,
  containerId: string = 'recaptcha-container',
  allowConfiguredLocalTest: boolean = false,
): Promise<ConfirmationResult> {
  const formatted = formatE164(phoneNumber);
  const authInstance = getFirebaseAuth(config);
  const local = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  if (allowConfiguredLocalTest && local && config.firebase_test_phone && formatted === formatE164(config.firebase_test_phone)) {
    authInstance.settings.appVerificationDisabledForTesting = true;
  }
  const verifier = setupRecaptcha(containerId, authInstance);
  return signInWithPhoneNumber(authInstance, formatted, verifier);
}


/** Send a fresh step-up code to the customer's phone; on a local run the Firebase test code is prefilled. */
export async function sendStepUpCode(phoneNumber: string, config: PublicAuthConfig, containerId: string): Promise<{ confirmation: ConfirmationResult; prefill: string }> {
  const confirmation = await sendRealPhoneOtp(phoneNumber, config, containerId, true);
  return { confirmation, prefill: config.is_local ? config.firebase_test_code ?? '' : '' };
}

/** Confirm the code with Firebase and elevate the Kosh session to L3. */
export async function completeStepUp(confirmation: ConfirmationResult, code: string): Promise<void> {
  const credential = await confirmation.confirm(code.trim());
  await firebaseStepUp(await credential.user.getIdToken(true));
}
