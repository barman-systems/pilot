terraform {
  required_version = ">= 1.8.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 7.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "DABBIR"
      Environment = var.environment
      DataRegion  = "UAE"
      ManagedBy   = "Terraform"
    }
  }
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_vpc" "dabbir" {
  cidr_block           = "10.73.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
}

resource "aws_internet_gateway" "dabbir" {
  vpc_id = aws_vpc.dabbir.id
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.dabbir.id
  cidr_block              = "10.73.10.0/24"
  map_public_ip_on_launch = false
  availability_zone       = var.availability_zone
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.dabbir.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.dabbir.id
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "supabase" {
  name_prefix = "dabbir-uae-supabase-"
  description = "DABBIR UAE Supabase: web only; PostgreSQL is never public"
  vpc_id      = aws_vpc.dabbir.id

  ingress {
    description      = "HTTPS"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  ingress {
    description      = "HTTP redirect / ACME"
    from_port        = 80
    to_port          = 80
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_s3_bucket" "backups" {
  bucket_prefix = "dabbir-uae-backups-"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "backup-retention"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    expiration {
      days = var.backup_retention_days
    }
  }
}

resource "aws_iam_role" "instance" {
  name_prefix = "dabbir-uae-supabase-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "backup_access" {
  role = aws_iam_role.instance.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:ListBucket"]
      Resource = [aws_s3_bucket.backups.arn]
      }, {
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
      Resource = ["${aws_s3_bucket.backups.arn}/*"]
    }]
  })
}

resource "aws_iam_instance_profile" "instance" {
  name_prefix = "dabbir-uae-supabase-"
  role        = aws_iam_role.instance.name
}

resource "aws_instance" "supabase" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.supabase.id]
  iam_instance_profile   = aws_iam_instance_profile.instance.name
  monitoring             = true

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    encrypted   = true
    volume_type = "gp3"
    volume_size = var.root_volume_gb
    iops        = 3000
    throughput  = 125
  }

  user_data = templatefile("${path.module}/cloud-init.sh.tftpl", {
    backup_bucket = aws_s3_bucket.backups.bucket
  })

  lifecycle {
    ignore_changes = [ami]
  }
}

resource "aws_eip" "supabase" {
  domain     = "vpc"
  instance   = aws_instance.supabase.id
  depends_on = [aws_internet_gateway.dabbir]
}
