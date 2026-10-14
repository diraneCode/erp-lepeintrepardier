"use client"

import * as React from "react"
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form"
import { fr } from "date-fns/locale"
import { LuCalendar, LuCheck, LuChevronsUpDown } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { formatDate, toDate, toISODate } from "@/lib/format"
import { cn } from "@/lib/utils"

type BaseProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label?: string
  description?: string
  required?: boolean
  className?: string
  disabled?: boolean
}

export interface Option {
  value: string
  label: string
  hint?: string
}

function RequiredMark({ required }: { required?: boolean }) {
  return required ? <span className="text-destructive">*</span> : null
}

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  className,
  disabled,
  ...input
}: BaseProps<T> & Omit<React.ComponentProps<typeof Input>, "name">) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          {label && (
            <FieldLabel htmlFor={name}>
              {label} <RequiredMark required={required} />
            </FieldLabel>
          )}
          <Input id={name} {...input} {...field} value={field.value ?? ""} disabled={disabled} aria-invalid={fieldState.invalid} />
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  )
}

export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  className,
  disabled,
  suffix,
  min,
  step,
  placeholder,
}: BaseProps<T> & { suffix?: string; min?: number; step?: number; placeholder?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          {label && (
            <FieldLabel htmlFor={name}>
              {label} <RequiredMark required={required} />
            </FieldLabel>
          )}
          <div className="relative">
            <Input
              id={name}
              type="number"
              inputMode="decimal"
              min={min}
              step={step ?? "any"}
              placeholder={placeholder}
              disabled={disabled}
              ref={field.ref}
              name={field.name}
              onBlur={field.onBlur}
              value={Number.isFinite(field.value) ? field.value : ""}
              onChange={(e) => field.onChange(e.target.value === "" ? Number.NaN : e.target.valueAsNumber)}
              aria-invalid={fieldState.invalid}
              className={cn("tabular", suffix && "pr-14")}
            />
            {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
          </div>
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  )
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  className,
  disabled,
  ...input
}: BaseProps<T> & Omit<React.ComponentProps<typeof Textarea>, "name">) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          {label && (
            <FieldLabel htmlFor={name}>
              {label} <RequiredMark required={required} />
            </FieldLabel>
          )}
          <Textarea id={name} {...input} {...field} value={field.value ?? ""} disabled={disabled} aria-invalid={fieldState.invalid} />
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  )
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  className,
  disabled,
  options,
  placeholder = "Sélectionner…",
}: BaseProps<T> & { options: Option[]; placeholder?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          {label && (
            <FieldLabel htmlFor={name}>
              {label} <RequiredMark required={required} />
            </FieldLabel>
          )}
          <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={disabled}>
            <SelectTrigger id={name} className="w-full" aria-invalid={fieldState.invalid} onBlur={field.onBlur}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  )
}

/** Sélecteur avec recherche, adapté aux longues listes (clients, produits…). */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Rechercher…",
  emptyText = "Aucun résultat.",
  invalid,
  disabled,
  className,
  id,
}: {
  value?: string | null
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  emptyText?: string
  invalid?: boolean
  disabled?: boolean
  className?: string
  id?: string
}) {
  const [open, setOpen] = React.useState(false)
  const current = options.find((o) => o.value === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !current && "text-muted-foreground", className)}
        >
          <span className="truncate">{current ? current.label : placeholder}</span>
          <LuChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ""} ${o.value}`}
                  onSelect={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                >
                  <LuCheck className={cn("size-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="ml-auto truncate text-xs text-muted-foreground">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function ComboboxField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  className,
  disabled,
  options,
  placeholder,
}: BaseProps<T> & { options: Option[]; placeholder?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          {label && (
            <FieldLabel htmlFor={name}>
              {label} <RequiredMark required={required} />
            </FieldLabel>
          )}
          <Combobox id={name} value={field.value} onChange={field.onChange} options={options} placeholder={placeholder} invalid={fieldState.invalid} disabled={disabled} />
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  )
}

export function DateField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  className,
  disabled,
}: BaseProps<T>) {
  const [open, setOpen] = React.useState(false)
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const date = toDate(field.value)
        return (
          <Field data-invalid={fieldState.invalid} className={className}>
            {label && (
              <FieldLabel htmlFor={name}>
                {label} <RequiredMark required={required} />
              </FieldLabel>
            )}
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  id={name}
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  aria-invalid={fieldState.invalid}
                  className={cn("w-full justify-start font-normal", !date && "text-muted-foreground")}
                >
                  <LuCalendar className="text-muted-foreground" />
                  {date ? formatDate(date, "d MMMM yyyy") : "Choisir une date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  locale={fr}
                  selected={date ?? undefined}
                  defaultMonth={date ?? undefined}
                  captionLayout="dropdown"
                  onSelect={(d) => {
                    field.onChange(d ? toISODate(d) : "")
                    setOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
            {description && <FieldDescription>{description}</FieldDescription>}
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )
      }}
    />
  )
}

export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  disabled,
}: BaseProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field orientation="horizontal" className={cn("rounded-lg border p-3", className)}>
          <FieldContent>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            {description && <FieldDescription>{description}</FieldDescription>}
          </FieldContent>
          <Switch id={name} checked={Boolean(field.value)} onCheckedChange={field.onChange} disabled={disabled} />
        </Field>
      )}
    />
  )
}
