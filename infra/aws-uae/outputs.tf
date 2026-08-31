output "region" {
  value = var.aws_region
}

output "public_ipv4" {
  value = aws_eip.supabase.public_ip
}

output "backup_bucket" {
  value = aws_s3_bucket.backups.bucket
}

output "instance_id" {
  value = aws_instance.supabase.id
}

output "postgres_publicly_exposed" {
  value = false
}
