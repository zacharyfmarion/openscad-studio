import * as RadixAccordion from '@radix-ui/react-accordion';
import { forwardRef } from 'react';

export const Accordion = RadixAccordion.Root;

export const AccordionItem = forwardRef<
  HTMLDivElement,
  RadixAccordion.AccordionItemProps & { className?: string }
>(({ className = '', ...props }, ref) => (
  <RadixAccordion.Item ref={ref} className={className} {...props} />
));

AccordionItem.displayName = 'AccordionItem';

export const AccordionTrigger = forwardRef<
  HTMLButtonElement,
  RadixAccordion.AccordionTriggerProps & { className?: string }
>(({ className = '', children, ...props }, ref) => (
  <RadixAccordion.Header>
    <RadixAccordion.Trigger ref={ref} className={className} {...props}>
      {children}
    </RadixAccordion.Trigger>
  </RadixAccordion.Header>
));

AccordionTrigger.displayName = 'AccordionTrigger';

export const AccordionContent = forwardRef<
  HTMLDivElement,
  RadixAccordion.AccordionContentProps & { className?: string }
>(({ className = '', ...props }, ref) => (
  <RadixAccordion.Content ref={ref} className={className} {...props} />
));

AccordionContent.displayName = 'AccordionContent';
