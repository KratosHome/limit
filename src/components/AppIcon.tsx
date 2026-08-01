import { appInitials, appPalette } from '../lib/format';

interface AppIconProps {
  id: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

export function AppIcon({ id, name, size = 'md' }: AppIconProps) {
  const [foreground, background] = appPalette(id);
  const classes = size === 'sm' ? 'h-8 w-8 rounded-[10px] text-[10px]' : size === 'lg' ? 'h-12 w-12 rounded-2xl text-sm' : 'h-10 w-10 rounded-xl text-xs';
  return (
    <div className={`${classes} grid shrink-0 place-items-center font-bold tracking-tight`} style={{ color: foreground, backgroundColor: background }} aria-hidden="true">
      {appInitials(name)}
    </div>
  );
}
