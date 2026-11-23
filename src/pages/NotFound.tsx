import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
export default function NotFound() {
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="text-center"><p className="text-sm font-semibold text-blue-600">404</p><h1 className="brand mt-4 text-3xl">Questa pagina non è disponibile.</h1><p className="mt-4 text-sm text-slate-500">Il collegamento potrebbe non essere corretto.</p><Button asChild className="mt-6 rounded-xl"><Link to="/">Torna alla panoramica</Link></Button></div></div>;
}
