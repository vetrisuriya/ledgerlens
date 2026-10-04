import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, RefreshCw, ShieldCheck } from 'lucide-react';
import { Dropzone } from '../components/Dropzone';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { ocrEngine } from '../ocr/engine';
import { deriveColumns, detectProvider } from '../ocr/parse';
import { columnLabel } from '../lib/format';
import { PROVIDER_LABEL, type FieldKey } from '../types';

export interface Reference {
  columns: FieldKey[];
  provider: string;
  sourceFile: string;
}

interface ReferencePageProps {
  onContinue: (reference: Reference) => void;
}

type Phase = 'idle' | 'reading' | 'ready' | 'error';

const STEPS = [
  'Add one reference screenshot of a completed transaction.',
  'LedgerLens reads the headings on it and builds your column list.',
  'Continue to the batch screen and add as many images as you like.',
];

export function ReferencePage({ onContinue }: ReferencePageProps) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [reference, setReference] = useState<Reference | null>(null);

  const previewUrl = useRef<string | null>(null);
  const mounted = useRef(true);

  function releasePreview() {
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    }
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      releasePreview();
    };
  }, []);

  const accept = (incoming: File[]) => {
    const image = incoming[0];
    if (!image) return;

    releasePreview();
    previewUrl.current = URL.createObjectURL(image);
    setFile(image);
    setReference(null);
    setPhase('idle');
    setMessage('');
  };

  const analyze = async () => {
    if (!file) return;

    setPhase('reading');
    setProgress(0);
    setMessage('');

    try {
      const ocr = await ocrEngine.recognize(file, { onProgress: setProgress });
      if (!mounted.current) return;

      const columns = deriveColumns(ocr);
      if (columns.length === 0) {
        setPhase('error');
        setMessage(
          'No fields were recognised in that image. Try a screenshot of the full transaction details screen, with the headings visible.',
        );
        return;
      }

      setReference({
        columns,
        provider: PROVIDER_LABEL[detectProvider(ocr.text)],
        sourceFile: file.name,
      });
      setPhase('ready');
    } catch (error) {
      if (!mounted.current) return;
      setPhase('error');
      setMessage(error instanceof Error ? error.message : 'Could not read that image');
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-2xl">
        <CardHeader className="flex-col items-start gap-1 border-b pb-4">
          <CardTitle className="text-lg">Set the table shape</CardTitle>
          <p className="text-sm text-muted-foreground">
            Start with one payment screenshot. The field headings it contains become the columns
            for every image that follows.
          </p>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <ol className="flex flex-col gap-2.5">
            {STEPS.map((step, index) => (
              <li key={step} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>

          {!file ? (
            <Dropzone
              onFiles={accept}
              title="Drop a reference screenshot"
              hint="PNG, JPG or WebP"
            />
          ) : (
            <>
              <div className="flex justify-center rounded-md border bg-muted/30 p-3">
                <img
                  src={previewUrl.current ?? ''}
                  alt="Reference screenshot preview"
                  className="max-h-72 rounded"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="max-w-full truncate font-mono text-[11px]">
                  {file.name}
                </Badge>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={phase === 'reading'}
                  onClick={() => {
                    setFile(null);
                    releasePreview();
                  }}
                >
                  Change
                </Button>
                <Button size="sm" onClick={analyze} disabled={phase === 'reading'}>
                  <RefreshCw className={phase === 'reading' ? 'animate-spin' : undefined} />
                  {phase === 'reading' ? `Reading ${Math.round(progress * 100)}%` : 'Detect fields'}
                </Button>
              </div>

              {phase === 'ready' && reference && (
                <div className="flex flex-col gap-2.5">
                  <Alert variant="info">
                    <ShieldCheck />
                    <AlertDescription>
                      Found {reference.columns.length} fields
                      {reference.provider !== 'Unknown'
                        ? ` from a ${reference.provider} receipt`
                        : ''}
                      . Columns follow the order they appear on the screenshot.
                    </AlertDescription>
                  </Alert>

                  <div className="flex flex-wrap gap-1.5">
                    {reference.columns.map((key, index) => (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary"
                      >
                        <Check className="size-3" />
                        <span className="font-mono text-[10px] opacity-60">{index + 1}</span>
                        {columnLabel(key)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {phase === 'error' && (
                <Alert variant="destructive">
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>

        <CardFooter className="justify-end gap-2">
          <Button
            size="lg"
            disabled={!reference}
            onClick={() => reference && onContinue(reference)}
          >
            Continue to batch upload
            <ArrowRight />
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
