import { Tooltip as TooltipPrimitive } from "bits-ui";
import Content from "./tooltip-content.svelte";

const Root = TooltipPrimitive.Root;
const Trigger = TooltipPrimitive.Trigger;
const Provider = TooltipPrimitive.Provider;
const Arrow = TooltipPrimitive.Arrow;

export {
	Root,
	Trigger,
	Content,
	Provider,
	Arrow,
	//
	Root as Tooltip,
	Trigger as TooltipTrigger,
	Content as TooltipContent,
	Provider as TooltipProvider,
	Arrow as TooltipArrow,
};
