variable "aws_region" {
  description = "AWS UAE region. Keep this locked for data residency."
  type        = string
  default     = "me-central-1"
  validation {
    condition     = var.aws_region == "me-central-1"
    error_message = "DABBIR UAE infrastructure must stay in me-central-1."
  }
}

variable "availability_zone" {
  description = "Initial single-node AZ. Multi-node HA can be layered later without changing the data-residency region."
  type        = string
  default     = "me-central-1a"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "instance_type" {
  description = "Supabase Docker host. 4 vCPU / 16 GB default exceeds the official 8 GB recommendation."
  type        = string
  default     = "t3.xlarge"
}

variable "root_volume_gb" {
  type    = number
  default = 100
  validation {
    condition     = var.root_volume_gb >= 80
    error_message = "Use at least 80 GB for the self-hosted Supabase stack."
  }
}

variable "backup_retention_days" {
  type    = number
  default = 35
}
