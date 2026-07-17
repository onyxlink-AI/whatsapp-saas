type Props = {
  title: string;
};

export default function PlaceholderView({ title }: Props) {
  return (
    <div className="onyx-placeholder h-full flex flex-col items-center justify-center text-center px-6">
      <div className="relative w-14 h-14 border border-violet-400/30 rounded-md bg-black/30 flex items-center justify-center mb-5 shadow-[inset_0_0_20px_rgba(124,58,237,.12)]">
        <span className="absolute inset-2 border border-white/[0.06] rounded-sm" />
        <span className="w-2 h-2 rounded-full bg-violet-300 shadow-[0_0_14px_#8b5cf6]" />
      </div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-violet-300/60 mb-2">Oficina Virtual</div>
      <h2 className="text-white font-semibold mb-1">{title}</h2>
      <p className="text-sm text-white/32 max-w-xs">Esta sección está en construcción. De momento la oficina 3D es la vista principal.</p>
    </div>
  );
}
