import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Footer } from './components/Footer';
import { GuideLinks } from './components/GuideLinks';
import { Logo } from './components/Logo';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { APP } from './config';
import { ReferencePage, type Reference } from './pages/ReferencePage';
import { WorkspacePage } from './pages/WorkspacePage';

type View = 'reference' | 'workspace';

export default function App() {
  const [view, setView] = useState<View>(readView);
  const [reference, setReference] = useState<Reference | null>(null);

  // The batch view needs a schema, which only exists after the reference step,
  // so the hash is advisory: it records where you are for the back button but
  // cannot open a batch view that has no columns.
  useEffect(() => {
    const onHashChange = () => {
      setView(window.location.hash === '#/batch' && reference ? 'workspace' : 'reference');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [reference]);

  useEffect(() => {
    const next = view === 'workspace' ? '#/batch' : '#/';
    if (window.location.hash !== next) window.history.replaceState(null, '', next);
  }, [view]);

  const start = (next: Reference) => {
    setReference(next);
    setView('workspace');
  };

  const reset = () => {
    setReference(null);
    setView('reference');
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/95 px-5 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">{APP.name}</div>
            <p className="hidden text-[11px] text-muted-foreground sm:block">{APP.tagline}</p>
          </div>
        </div>

        <div className="flex-1" />

        {view === 'workspace' && reference ? (
          <>
            <Badge variant="secondary" className="hidden max-w-[22rem] truncate md:inline-flex">
              {reference.columns.length} columns from {reference.sourceFile}
            </Badge>
            <Badge variant="success">
              <ShieldCheck />
              No image storage
            </Badge>
            <Button variant="outline" size="sm" onClick={reset}>
              New reference
            </Button>
          </>
        ) : (
          <Badge variant="muted" className="hidden sm:inline-flex">
            Free · open source · no login
          </Badge>
        )}
      </header>

      {view === 'workspace' && reference ? (
        <WorkspacePage reference={reference} onReset={reset} />
      ) : (
        <ReferencePage onContinue={start} />
      )}

      {view === 'reference' && <GuideLinks />}

      <Footer />
    </div>
  );
}

function readView(): View {
  return window.location.hash === '#/batch' ? 'workspace' : 'reference';
}
