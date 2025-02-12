import { z } from "zod"

export const LeaveRequestSchema = z
  .object({
    fechaInicio: z
      .date({
        required_error: "La fecha de inicio es requerida",
      })
      .min(new Date(), "No se pueden seleccionar fechas pasadas"),
    fechaFin: z
      .date({
        required_error: "La fecha de fin es requerida",
      })
      .min(new Date(), "No se pueden seleccionar fechas pasadas"),
    cantidad: z.number().min(1, "El período debe ser de al menos 1 día"),
    tipo: z.enum(
      [
        "Licencia",
        "Parte_Medico",
        "Profilactica",
        "Particular",
        "Matrimonio",
        "Matrimonio_Hijo",
        "Paternidad",
        "Paternidad_Especial",
        "Maternidad",
        "Fallecimiento",
        "Enfermedad",
        "Guarda_Tenencia",
      ],
      {
        required_error: "Debe seleccionar un tipo de licencia",
      },
    ),
    sexo: z
      .enum(["Masculino", "Femenino"], {
        required_error: "El sexo es requerido para ciertas licencias",
      })
      .optional(),
  })
  .refine(
    (data) => {
      return data.fechaFin >= data.fechaInicio
    },
    {
      message: "La fecha de fin no puede ser anterior a la fecha de inicio",
      path: ["fechaFin"],
    },
  )
  .refine(
    (data) => {
      if (data.tipo === "Particular") {
        return data.cantidad <= 2
      }
      return true
    },
    {
      message: "Las licencias particulares no pueden exceder 2 días",
      path: ["cantidad"],
    },
  )
  .refine(
    (data) => {
      if (data.tipo === "Matrimonio") {
        return data.cantidad <= 12
      }
      return true
    },
    {
      message: "La licencia por matrimonio no puede exceder 12 días",
      path: ["cantidad"],
    },
  )
  .refine(
    (data) => {
      if (data.tipo === "Matrimonio_Hijo") {
        return data.cantidad <= 2
      }
      return true
    },
    {
      message: "La licencia por matrimonio de hijo no puede exceder 2 días",
      path: ["cantidad"],
    },
  )
  .refine(
    (data) => {
      if (data.tipo === "Paternidad") {
        if (data.sexo !== "Masculino") {
          return false
        }
        return data.cantidad <= 5
      }
      return true
    },
    {
      message: "La licencia por paternidad es solo para empleados masculinos y no puede exceder 5 días",
      path: ["cantidad"],
    },
  )
  .refine(
    (data) => {
      if (data.tipo === "Paternidad_Especial") {
        return data.cantidad <= 30
      }
      return true
    },
    {
      message: "La licencia por paternidad especial no puede exceder 30 días",
      path: ["cantidad"],
    },
  )
  .refine(
    (data) => {
      if (data.tipo === "Maternidad") {
        return data.cantidad <= 30
      }
      return true
    },
    {
      message: "La licencia por maternidad no puede exceder 30 días",
      path: ["cantidad"],
    },
  )
  .refine(
    (data) => {
      if (data.tipo === "Fallecimiento") {
        return data.cantidad >= 1 && data.cantidad <= 5
      }
      return true
    },
    {
      message: "La licencia por fallecimiento debe ser entre 1 y 5 días",
      path: ["cantidad"],
    },
  )
  .refine(
    (data) => {
      if (data.tipo === "Enfermedad") {
        return data.cantidad <= 28
      }
      return true
    },
    {
      message: "La licencia por enfermedad no puede exceder 28 días",
      path: ["cantidad"],
    },
  )
  .refine(
    (data) => {
      if (data.tipo === "Guarda_Tenencia") {
        return data.cantidad >= 10 && data.cantidad <= 15
      }
      return true
    },
    {
      message: "La licencia por guarda-tenencia debe ser entre 10 y 15 días",
      path: ["cantidad"],
    },
  )

