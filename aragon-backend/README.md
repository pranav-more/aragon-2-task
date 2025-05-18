# Aragon Image Processing API

A RESTful API for processing and storing images, with support for HEIC to JPEG/PNG conversion.

## Features

- Upload images to Amazon S3 or local storage
- Process and optimize images asynchronously
- Convert HEIC/HEIF images to JPEG format
- Store image metadata in PostgreSQL
- RESTful API for image management
- Secure file handling and storage

## Tech Stack

- **Node.js** with **Express** for the API server
- **PostgreSQL** for database
- **Prisma** as the ORM
- **Amazon S3** or **Local Storage** for file storage
- **Sharp** for image processing
- **Multer** and **Multer-S3** for file uploads
- **AWS SDK** for S3 operations

## Prerequisites

- Node.js (v14+)
- PostgreSQL
- AWS account with S3 access (optional - local storage available for development)

## Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd aragon-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```
# Database configuration
DATABASE_URL="postgresql://username:password@localhost:5432/aragon_images?schema=public"

# Storage Configuration
# To use local storage instead of S3, either leave AWS keys empty or set STORAGE_TYPE=local
STORAGE_TYPE="local" # Use "s3" to force S3 storage

# AWS S3 Configuration (only needed if STORAGE_TYPE is "s3")
AWS_ACCESS_KEY_ID="your_access_key_id"
AWS_SECRET_ACCESS_KEY="your_secret_access_key"
AWS_REGION="us-east-1"
S3_BUCKET_NAME="aragon-images"

# Server configuration
PORT=3001
NODE_ENV=development
```

### 4. Set up the database

Create a PostgreSQL database:

```bash
createdb aragon_images
```

Run database migrations:

```bash
npm run db:push
```

### 5. Start the server

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

## API Endpoints

### Upload Image

```
POST /api/images
```

- Form data key: `image`
- Supported file types: JPG, JPEG, PNG, GIF, HEIC, HEIF
- Max file size: 10MB

### Get All Images

```
GET /api/images?page=1&limit=10&status=PROCESSED
```

Query parameters:

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)
- `status`: Filter by status (PENDING, PROCESSING, PROCESSED, FAILED)

### Get Image by ID

```
GET /api/images/:id
```

Returns image metadata and signed URLs for accessing the original and processed images.

### Delete Image

```
DELETE /api/images/:id
```

Deletes an image and its associated files from S3 or local storage.

### Process Image (Manual Trigger)

```
POST /api/images/:id/process
```

Manually triggers image processing for an image.

## Error Handling

The API uses standard HTTP status codes:

- 200: Success
- 201: Created
- 400: Bad Request
- 404: Not Found
- 500: Server Error

## Storage Options

### Local Storage (Development)

For development, you can use local file storage by:

1. Setting `STORAGE_TYPE=local` in your `.env` file
2. Or by simply not providing AWS credentials

Files will be stored in the `uploads/` directory, with original and processed images in their respective subdirectories.

### S3 Setup (Production)

For production usage with S3:

1. Create an S3 bucket in your AWS account
2. Configure CORS for the bucket to allow uploads from your domain
3. Create IAM credentials with access to the bucket (use IAM roles for EC2/Lambda if possible)
4. Set the S3 credentials in your `.env` file
5. **Security best practices:**
   - Use IAM roles instead of access keys in production environments
   - Restrict S3 bucket permissions to minimum required
   - Enable bucket encryption
   - Consider using AWS Parameter Store or Secrets Manager for credentials
   - Never commit `.env` files with real credentials to version control

## Database Schema

The database schema includes a single `Image` table with the following fields:

- `id`: Unique identifier (UUID)
- `originalName`: Original filename
- `originalSize`: Original file size in bytes
- `originalPath`: Path to original file in S3 or local storage
- `processedName`: Processed filename (if any)
- `processedSize`: Processed file size in bytes (if any)
- `processedPath`: Path to processed file in S3 or local storage (if any)
- `fileType`: File extension (e.g., 'jpg', 'png', 'heic')
- `width`: Image width (after processing)
- `height`: Image height (after processing)
- `status`: Processing status (PENDING, PROCESSING, PROCESSED, FAILED)
- `createdAt`: Timestamp when the record was created
- `updatedAt`: Timestamp when the record was last updated

## Future Improvements

- Add authentication and authorization
- Implement a job queue for image processing (e.g., Bull, AWS SQS)
- Add more image processing options (resize, crop, etc.)
- Add image compression options
- Add support for more file formats
- Add unit and integration tests
- Add Docker support for easier deployment
