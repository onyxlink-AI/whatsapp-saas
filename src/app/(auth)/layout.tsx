import Image from "next/image";
import { AuthHeroMotion } from "@/features/auth/components/auth-hero-motion-loader";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
      <aside className="auth-hero app-sidebar relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="auth-hero__grid" aria-hidden="true" />
        <div className="auth-hero__aurora auth-hero__aurora--one" aria-hidden="true" />
        <div className="auth-hero__aurora auth-hero__aurora--two" aria-hidden="true" />

        <div className="relative z-30 flex items-start justify-between gap-6">
          <div>
            <Image
              src="/brand/onyxlink-logo.png"
              alt="OnyxLink"
              width={174}
              height={35}
              className="h-auto w-44"
              priority
            />
          </div>

          <div className="auth-system-status" aria-label="Sistema OnyxLink operativo">
            <span className="auth-system-status__pulse" aria-hidden="true" />
            <span>OnyxLink Sistema</span>
            <span className="text-white/30">{"//"}</span>
            <span className="text-emerald-300">Operativo</span>
          </div>
        </div>

        <div className="relative z-30 max-w-xl pb-16 xl:pb-20">
          <p className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#A0DCDB]">
            <span className="h-px w-8 bg-[#8AD3D2]/70" aria-hidden="true" />
            Tu empresa, conectada
          </p>
          <h1 className="font-display max-w-xl text-4xl font-semibold leading-[1.04] tracking-[-0.04em] xl:text-[3.35rem]">
            Conversaciones, agentes y gestión en un solo lugar.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/60">
            OnyxLink reúne el trabajo diario de tu empresa para que puedas decidir más rápido y automatizar con control.
          </p>
          <div className="mt-8 flex max-w-lg flex-wrap gap-2.5" aria-label="Capacidades de OnyxLink">
            {[
              ["01", "Atiende"],
              ["02", "Organiza"],
              ["03", "Crece"],
            ].map(([number, label]) => (
              <div key={number} className="auth-capability-chip">
                <span className="text-[10px] font-semibold text-[#A0DCDB]">{number}</span>
                <span className="text-xs font-medium text-white/80">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <AuthHeroMotion />
        <div className="auth-hero__image-shade" aria-hidden="true" />

        <div className="relative z-30 flex items-center justify-between gap-4 text-[11px] text-white/30">
          <p>© 2026 OnyxLink · Tecnología para empresas</p>
          <p className="hidden items-center gap-2 2xl:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" aria-hidden="true" />
            Conexión protegida
          </p>
        </div>
      </aside>

      <main className="auth-login-canvas relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-8">
        <div className="auth-login-canvas__glow" aria-hidden="true" />
        <div className="relative z-10 w-full">{children}</div>
      </main>
    </div>
  );
}
