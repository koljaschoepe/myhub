import type { ReactNode } from "react";
import { TooltipProvider, Tooltip } from "./Tooltip";
import { Button } from "./Button";

export default {
  title: "ui/Tooltip",
  decorators: [
    (Story: () => ReactNode) => (
      <TooltipProvider delayDuration={300}>
        <Story />
      </TooltipProvider>
    ),
  ],
};

export const Basic = () => (
  <Tooltip content="This action saves the document">
    <Button variant="ghost">Save</Button>
  </Tooltip>
);

export const Sides = () => (
  <div className="grid grid-cols-2 gap-4 p-12">
    <Tooltip content="Top tooltip" side="top">
      <Button variant="ghost">Top</Button>
    </Tooltip>
    <Tooltip content="Right tooltip" side="right">
      <Button variant="ghost">Right</Button>
    </Tooltip>
    <Tooltip content="Bottom tooltip" side="bottom">
      <Button variant="ghost">Bottom</Button>
    </Tooltip>
    <Tooltip content="Left tooltip" side="left">
      <Button variant="ghost">Left</Button>
    </Tooltip>
  </div>
);

export const EmptyContentSkips = () => (
  <Tooltip content="">
    <Button variant="ghost">No tooltip wrapper rendered</Button>
  </Tooltip>
);
