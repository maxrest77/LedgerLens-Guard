import React, { useState } from 'react';
import { Shield, Key, Copy, Check, AlertTriangle, Clock, Lock, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import api from '../../lib/api';

interface GenerateVaultLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
}

export const GenerateVaultLinkModal: React.FC<GenerateVaultLinkModalProps> = ({
  isOpen,
  onClose,
  caseId,
}) => {
  const [expiryHours, setExpiryHours] = useState<number>(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    share_id: string;
    token: string;
    otp: string;
    share_url: string;
    expires_at: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedOtp, setCopiedOtp] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/vault/share/generate', {
        case_id: caseId,
        expiry_hours: expiryHours,
      });
      setResult(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to generate secure auditor link.');
    } finally {
      setLoading(false);
    }
  };

  const getFullUrl = (relativeUrl: string) => {
    return `${window.location.origin}${relativeUrl}`;
  };

  const copyToClipboard = (text: string, type: 'link' | 'otp') => {
    navigator.clipboard.writeText(text);
    if (type === 'link') {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } else {
      setCopiedOtp(true);
      setTimeout(() => setCopiedOtp(false), 2500);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200/80 p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100/60">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Secure Auditor Retrieval Vault
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Generate a time-limited, dual-factor protected link for external auditors or regulators.
              </p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2 mt-4">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {!result ? (
          <div className="space-y-4 py-4">
            <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-4 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Target Audit Scope
              </span>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700">Case ID:</span>
                <span className="font-mono font-bold text-blue-600">{caseId}</span>
              </div>
              <p className="text-xs text-slate-500">
                The recipient will gain read-only access to this case, its sealed cryptographic audit proof, and original attached evidence files.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Access Window (Auto-Expiration)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '24 Hours', value: 24 },
                  { label: '48 Hours', value: 48 },
                  { label: '7 Days', value: 168 },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setExpiryHours(opt.value)}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                      expiryHours === opt.value
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-200/60 rounded-xl p-3.5 flex items-start gap-3">
              <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 leading-relaxed">
                <span className="font-bold">Dual-Factor Security:</span> A unique 6-digit OTP will be generated. You should share the link via email and the OTP via a separate channel (SMS/Call) to prevent unauthorized interception.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button variant="ghost" onClick={onClose} disabled={loading} className="text-xs font-semibold">
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm px-5"
              >
                {loading ? 'Securing Ledger...' : 'Generate Secure Link & OTP'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Secure Auditor Link Created & Sealed into Audit Chain!</span>
            </div>

            {/* Share Link */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">1. Shareable Access URL</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={getFullUrl(result.share_url)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 select-all outline-none"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(getFullUrl(result.share_url), 'link')}
                  className="flex-shrink-0 text-xs font-bold h-9 gap-1.5"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedLink ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* 6-Digit OTP */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  2. Single-Use Security PIN / OTP
                </label>
                <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50">
                  Share Out-of-Band (SMS/Phone)
                </Badge>
              </div>
              <div className="flex items-center justify-between bg-slate-900 text-white p-3.5 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-amber-400" />
                  <div className="flex gap-1.5 font-mono text-xl font-bold tracking-widest text-amber-300">
                    {result.otp.split('').map((ch, idx) => (
                      <span key={idx} className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                        {ch}
                      </span>
                    ))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(result.otp, 'otp')}
                  className="text-xs text-slate-300 hover:text-white hover:bg-slate-800 h-8 gap-1"
                >
                  {copiedOtp ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedOtp ? 'Copied' : 'Copy PIN'}
                </Button>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200/60 leading-relaxed">
              <span className="font-bold text-slate-700">Security Safeguard:</span> This link will expire on{' '}
              <span className="font-semibold text-slate-800">{new Date(result.expires_at).toLocaleString()}</span>. 
              Entering 3 incorrect OTPs will permanently lock the link.
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button onClick={handleReset} className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-6">
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
