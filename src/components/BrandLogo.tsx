export default function BrandLogo({ className = '' }: { className?: string }) {
  return <img src="/assets/santorelli-desk-logo.svg" alt="Santorelli Desk" width={328} height={72} className={`h-auto w-48 ${className}`} />;
}
