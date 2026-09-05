import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  FileText,
  Download,
  Key,
  AlertTriangle,
  Building2,
  Fingerprint,
  ArrowRight,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import api from '../lib/api';
import { formatPaisa, formatDateTime } from '../lib/formatters';

interface DossierData {
  case: {
    case_id: string;
    severity: string;
    status: string;
    exception_code: string;
    expected_paisa: number;
    actual_paisa: number;
    delta_paisa: number;
    explanation: string;
    suggested_action: string;
    opened_at: string | null;
    resolved_at: string | null;
    resolved_by: string | null;
    co_reviewer_email: string | null;
  };
  file_manifest: Array<{
    attachment_id: number;
    filename: string;
    file_type: string;
    file_size_bytes: number;
    file_sha256: string;
    uploaded_at: string | null;
    submitter_role: string;
  }>;
  audit_proof: {
    block_index: number;
    timestamp: string;
    action: string;
    block_hash: string;
    previous_hash: string;
    reason: string;
  } | null;
  vault_metadata: {
    share_id: string;
    retrieved_at: string;
    confidentiality_notice: string;
  };
}

export default function PublicVaultAccess() {
  const { token } = useParams<{ token: string }>();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vaultToken, setVaultToken] = useState<string | null>(null);
  const [dossier, setDossier] = useState<DossierData | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !otp || otp.trim().length !== 6) {
      setError('Please enter a valid 6-digit numeric PIN/OTP.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Verify OTP
      const resVerify = await api.post('/api/vault/share/verify', {
        token: token.trim(),
        otp: otp.trim(),
      });

      const issuedToken = resVerify.data.vault_token;
      setVaultToken(issuedToken);

      // 2. Fetch Dossier with Vault Token
      const resDossier = await api.get('/api/vault/share/dossier', {
        headers: { Authorization: `Bearer ${issuedToken}` },
      });
      setDossier(resDossier.data);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          'Failed to authenticate with the forensic vault. Please verify your OTP.'
      );
    } finally {
      setLoading(false);
    }
  };

  const downloadRawFile = async (attachmentId: number, filename: string) => {
    if (!vaultToken) return;
    setDownloadingId(attachmentId);
    try {
      const res = await api.get(`/api/vault/share/download/${attachmentId}`, {
        headers: { Authorization: `Bearer ${vaultToken}` },
        responseType: 'blob',
      });
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Failed to download evidence file. Integrity check or session expired.');
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadExecutivePdf = async () => {
    if (!vaultToken || !dossier) return;
    setDownloadingPdf(true);
    try {
      const res = await api.get('/api/vault/share/executive-pdf', {
        headers: { Authorization: `Bearer ${vaultToken}` },
        responseType: 'blob',
      });
      const blobUrl = window.URL.createObjectURL(
        new Blob([res.data], { type: 'application/pdf' })
      );
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute(
        'download',
        `LedgerLens_Executive_Evidence_Pack_${dossier.case.case_id}.pdf`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Failed to download executive evidence pack.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  // State A: OTP Verification Form
  if (!dossier) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md relative z-10 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400 mb-2">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              LedgerLens Vault
            </h1>
            <p className="text-xs text-slate-400 max-w-xs mx-auto font-medium">
              Secure Compliance & Statutory Retrieval Portal. Protected by cryptographic access token & dual-factor OTP.
            </p>
          </div>

          <Card className="bg-slate-800/80 backdrop-blur-xl border-slate-700/80 shadow-2xl rounded-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                Dual-Factor Verification
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Enter the 6-digit access PIN provided to you out-of-band by the compliance team.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 block">
                    6-Digit Security PIN / OTP
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="• • • • • •"
                      autoFocus
                      className="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-widest text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                    <Key className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    For security, entering 3 incorrect PINs permanently burns this link.
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold h-11 text-xs shadow-lg shadow-blue-600/20 rounded-xl transition-all"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-2" />
                  )}
                  {loading ? 'Verifying Credentials...' : 'Unlock Forensic Dossier'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-[11px] text-center text-slate-600 font-medium">
            End-to-End Cryptographic Ledger • Powered by LedgerLens Guard
          </p>
        </div>
      </div>
    );
  }

  // State B: Watermarked Forensic Dossier View
  const isPositiveDelta = dossier.case.delta_paisa >= 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 relative">
      {/* Watermark overlay */}
      <div className="fixed inset-0 pointer-events-none select-none z-0 opacity-[0.03] flex flex-wrap items-center justify-center gap-24 p-8 overflow-hidden font-mono font-black text-3xl rotate-[-25deg]">
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i}>CONFIDENTIAL REGULATORY AUDIT COPY</span>
        ))}
      </div>

      <div className="max-w-5xl mx-auto space-y-6 relative z-10">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  Forensic Audit Dossier
                </h1>
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] uppercase font-bold">
                  Verified Authentic
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Target Reference: <span className="font-mono font-bold text-slate-200">{dossier.case.case_id}</span> • 
                Retrieved: {new Date(dossier.vault_metadata.retrieved_at).toLocaleString()}
              </p>
            </div>
          </div>

          <Button
            onClick={downloadExecutivePdf}
            disabled={downloadingPdf}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/20 h-10 px-5 rounded-xl gap-2 flex-shrink-0"
          >
            <Download className="w-4 h-4" />
            {downloadingPdf ? 'Generating PDF...' : 'Download Executive Evidence Pack'}
          </Button>
        </div>

        {/* Financial Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900/60 border-slate-800">
            <CardContent className="p-4 space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Status / Severity
              </span>
              <div className="flex items-center gap-2 pt-1">
                <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/30 font-bold">
                  {dossier.case.status}
                </Badge>
                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 font-bold">
                  {dossier.case.severity}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800">
            <CardContent className="p-4 space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Expected Amount
              </span>
              <p className="text-lg font-mono font-bold text-slate-100">
                {formatPaisa(dossier.case.expected_paisa)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800">
            <CardContent className="p-4 space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Actual Bank Entry
              </span>
              <p className="text-lg font-mono font-bold text-slate-100">
                {formatPaisa(dossier.case.actual_paisa)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800">
            <CardContent className="p-4 space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Discrepancy (Delta)
              </span>
              <p
                className={`text-lg font-mono font-bold ${
                  dossier.case.delta_paisa === 0
                    ? 'text-slate-400'
                    : isPositiveDelta
                    ? 'text-emerald-400'
                    : 'text-red-400'
                }`}
              >
                {formatPaisa(dossier.case.delta_paisa)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Narrative & Authorization Snapshot */}
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" />
              Reconciliation Investigation & Authorization Trail
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1">
              <span className="font-semibold text-slate-400">Classification & Finding:</span>
              <p className="text-slate-200 font-medium leading-relaxed">
                {dossier.case.explanation}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 font-semibold block mb-1">Primary Reviewer:</span>
                <span className="font-mono text-slate-300">{dossier.case.resolved_by || 'System Identified'}</span>
              </div>
              <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 font-semibold block mb-1">Co-Reviewer / Senior Approver:</span>
                <span className="font-mono text-slate-300">{dossier.case.co_reviewer_email || 'Executive Admin Sign-off'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cryptographic Audit Proof */}
        {dossier.audit_proof && (
          <Card className="bg-slate-900/60 border-emerald-900/40 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-emerald-400" />
                Cryptographic Ledger Proof (Tamper-Evident Hash Chain)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
                  <span className="text-slate-400 font-medium block">Block Index:</span>
                  <span className="text-base font-mono font-bold text-emerald-400">
                    #{dossier.audit_proof.block_index}
                  </span>
                </div>
                <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
                  <span className="text-slate-400 font-medium block">Action Sealed:</span>
                  <span className="text-sm font-mono font-bold text-slate-200">
                    {dossier.audit_proof.action}
                  </span>
                </div>
                <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
                  <span className="text-slate-400 font-medium block">Timestamp:</span>
                  <span className="text-xs font-mono text-slate-300">
                    {formatDateTime(dossier.audit_proof.timestamp)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-medium">SHA-256 Block Signature:</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyHash(dossier.audit_proof!.block_hash)}
                    className="h-6 px-2 text-[10px] text-slate-400 hover:text-white"
                  >
                    {copiedHash ? <Check className="w-3 h-3 text-emerald-400 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                    {copiedHash ? 'Copied' : 'Copy Hash'}
                  </Button>
                </div>
                <p className="font-mono text-[11px] text-emerald-300 break-all bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                  {dossier.audit_proof.block_hash}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Original Evidence Documents Manifest */}
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  Committed Evidence Files ({dossier.file_manifest.length})
                </CardTitle>
                <CardDescription className="text-xs text-slate-400 mt-0.5">
                  Original bank statements and advice slips retrieved directly from secure storage with live SHA-256 verification.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {dossier.file_manifest.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs font-medium border border-dashed border-slate-800 rounded-xl">
                No secondary bank files or advice slips were attached to this case.
              </div>
            ) : (
              <div className="space-y-3">
                {dossier.file_manifest.map((file) => (
                  <div
                    key={file.attachment_id}
                    className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px] font-mono font-bold">
                          {file.file_type}
                        </Badge>
                        <span className="font-bold text-xs text-slate-200 truncate">
                          {file.filename}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          ({(file.file_size_bytes / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                        <span>SHA-256:</span>
                        <span className="text-slate-300 truncate max-w-xs">{file.file_sha256}</span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => downloadRawFile(file.attachment_id, file.filename)}
                      disabled={downloadingId === file.attachment_id}
                      className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold h-9 px-3.5 rounded-lg border border-slate-700 gap-1.5 flex-shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {downloadingId === file.attachment_id ? 'Verifying...' : 'Download Original'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer Disclaimer */}
        <div className="p-4 bg-slate-900/40 border border-slate-800/60 rounded-xl text-center space-y-1">
          <p className="text-[11px] text-slate-400 font-medium">
            {dossier.vault_metadata.confidentiality_notice}
          </p>
          <p className="text-[10px] text-slate-500 font-mono">
            Session Security Anchor: {dossier.vault_metadata.share_id}
          </p>
        </div>
      </div>
    </div>
  );
}
