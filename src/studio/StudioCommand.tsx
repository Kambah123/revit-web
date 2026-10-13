import type { CommandSpec } from "../app/ribbon";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "../components/ui/command";
export function StudioCommand({
  commands,
  onRun,
  onClose,
}: {
  commands: CommandSpec[];
  onRun(id: string): void;
  onClose(): void;
}) {
  return (
    <CommandDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Command launcher"
      description="Search drawing tools, views and project actions."
      className="studio-theme launcher"
    >
      <CommandInput
        aria-label="Search commands"
        placeholder="What would you like to do?"
      />
      <CommandList>
        <CommandEmpty>No matching commands.</CommandEmpty>
        <CommandGroup heading="Commands">
          {commands
            .filter((c) => c.implemented)
            .map((c) => (
              <CommandItem
                key={c.id}
                value={c.title}
                keywords={[c.id, c.description]}
                disabled={!(c.enabled?.() ?? true)}
                onSelect={() => {
                  onClose();
                  onRun(c.id);
                }}
              >
                {c.title}
                <CommandShortcut>{c.shortcut}</CommandShortcut>
              </CommandItem>
            ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
