/* Page "Configurator" for the EEE.tech website. Route it at /configurator (see LOVABLE.md). */
import EEEConfigurator from "@/components/eee-configurator/EEEConfigurator";
import { CONFIGURATOR } from "@/components/eee-configurator/config";

export default function ConfiguratorPage() {
  return (
    <main className="container mx-auto px-4 py-10 md:py-14">
      <header className="mb-8 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">Product selection</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Find the right fuse or relay</h1>
        <p className="mt-3 text-muted-foreground">
          Electronic, power, pyro and smart fuses and HV relays from Sinofuse / Synoelec, supplied by EEE.Tech.
          Filter by rating, compare datasheet values, and request a quote for any part.
        </p>
      </header>
      <EEEConfigurator {...CONFIGURATOR} />
    </main>
  );
}
