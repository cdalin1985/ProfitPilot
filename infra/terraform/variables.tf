variable "project_name" {
  description = "Stable project identifier used in resource names and tags."
  type        = string
  default     = "profit-pilot"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,31}$", var.project_name))
    error_message = "project_name must be 3-32 lowercase letters, digits, or hyphens."
  }
}

variable "environment" {
  description = "Isolated deployment environment."
  type        = string

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "environment must be development, staging, or production."
  }
}

variable "aws_region" {
  description = "AWS region for the environment."
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "RFC1918 CIDR allocated to this environment."
  type        = string
  default     = "10.40.0.0/16"
}

variable "availability_zone_count" {
  description = "Number of availability zones used by public, application, and data tiers."
  type        = number
  default     = 3

  validation {
    condition     = var.availability_zone_count >= 2 && var.availability_zone_count <= 3
    error_message = "availability_zone_count must be 2 or 3."
  }
}

variable "nat_gateway_count" {
  description = "Use one NAT gateway outside production and one per AZ in production."
  type        = number
  default     = 1

  validation {
    condition     = var.nat_gateway_count == 1 || var.nat_gateway_count == 3
    error_message = "nat_gateway_count must be 1 or 3."
  }
}

variable "database_name" {
  description = "Initial PostgreSQL database name."
  type        = string
  default     = "profit_pilot"
}

variable "database_master_username" {
  description = "Administrative database username; AWS manages the generated password."
  type        = string
  default     = "profit_pilot_admin"
}

variable "database_min_capacity" {
  description = "Minimum Aurora Serverless v2 ACUs."
  type        = number
  default     = 1
}

variable "database_max_capacity" {
  description = "Maximum Aurora Serverless v2 ACUs."
  type        = number
  default     = 16
}

variable "database_instance_count" {
  description = "Aurora instances distributed across availability zones."
  type        = number
  default     = 2

  validation {
    condition     = var.database_instance_count >= 2 && var.database_instance_count <= 3
    error_message = "database_instance_count must be 2 or 3."
  }
}

variable "redis_node_type" {
  description = "ElastiCache node class; size this from staging load-test evidence."
  type        = string
  default     = "cache.t4g.small"
}

variable "deletion_protection" {
  description = "Protect stateful resources from accidental deletion."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention."
  type        = number
  default     = 90
}
