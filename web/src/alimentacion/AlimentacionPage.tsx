import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CaloriasCard } from "./CaloriasCard";
import { MicrosCard } from "./MicrosCard";
import { DiarioTab } from "./DiarioTab";

const PROXIMAMENTE = <p className="text-sm text-muted-foreground">Próximamente.</p>;

export function AlimentacionPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-medium">Alimentación</h1>
      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="diario">Diario</TabsTrigger>
          <TabsTrigger value="suplementos">Suplementos</TabsTrigger>
          <TabsTrigger value="informes">Informes</TabsTrigger>
          <TabsTrigger value="agua">Agua</TabsTrigger>
        </TabsList>
        <TabsContent value="resumen">
          <div className="grid gap-4 md:grid-cols-2">
            <CaloriasCard />
            <MicrosCard />
          </div>
        </TabsContent>
        <TabsContent value="diario"><DiarioTab /></TabsContent>
        <TabsContent value="suplementos">{PROXIMAMENTE}</TabsContent>
        <TabsContent value="informes">{PROXIMAMENTE}</TabsContent>
        <TabsContent value="agua">{PROXIMAMENTE}</TabsContent>
      </Tabs>
    </div>
  );
}
