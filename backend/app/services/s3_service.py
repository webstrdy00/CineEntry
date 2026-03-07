"""
AWS S3 Upload Service
S3 Presigned URL 생성 및 이미지 업로드 관리
"""
import boto3
from botocore.exceptions import ClientError
from typing import Dict, Optional
import uuid
from datetime import datetime

from app.config import settings


class S3Service:
    """AWS S3 서비스 클래스"""

    def __init__(self):
        """S3 클라이언트 초기화"""
        if not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
            self.client = None
            print("⚠️  AWS S3 credentials not configured")
        else:
            self.client = boto3.client(
                's3',
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                region_name=settings.AWS_REGION
            )
            self.bucket_name = settings.AWS_S3_BUCKET
            print(f"✅ S3 client initialized: {self.bucket_name}")

    def generate_presigned_url(
        self,
        file_name: str,
        file_type: str,
        folder: str = "images",
        expiration: int = 900  # 15분
    ) -> Optional[Dict[str, str]]:
        """
        S3 Presigned URL 생성

        Args:
            file_name: 원본 파일명
            file_type: MIME type (e.g., 'image/jpeg')
            folder: S3 폴더 경로 (기본값: 'images')
            expiration: URL 유효 시간 (초, 기본값: 900초 = 15분)

        Returns:
            {
                "upload_url": "S3 업로드 URL (PUT 요청용)",
                "file_url": "업로드된 파일의 최종 URL (GET 요청용)",
                "file_key": "S3 객체 키"
            }
        """
        if not self.client:
            raise Exception("S3 client not initialized. Check AWS credentials.")

        # 파일 확장자 추출
        file_extension = file_name.split('.')[-1] if '.' in file_name else 'jpg'

        # 고유한 파일명 생성 (UUID + timestamp)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_filename = f"{uuid.uuid4().hex}_{timestamp}.{file_extension}"

        # S3 객체 키 (경로 포함)
        file_key = f"{folder}/{unique_filename}"

        try:
            # Presigned URL 생성 (PUT 요청용)
            upload_url = self.client.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': file_key,
                    'ContentType': file_type
                },
                ExpiresIn=expiration
            )

            # 최종 파일 URL (GET 요청용)
            file_url = f"https://{self.bucket_name}.s3.{settings.AWS_REGION}.amazonaws.com/{file_key}"

            return {
                "upload_url": upload_url,
                "file_url": file_url,
                "file_key": file_key
            }

        except ClientError as e:
            print(f"❌ S3 Presigned URL 생성 실패: {e}")
            raise Exception(f"Failed to generate presigned URL: {str(e)}")

    def delete_file(self, file_key: str) -> bool:
        """
        S3 파일 삭제

        Args:
            file_key: S3 객체 키 (e.g., 'images/abc123.jpg')

        Returns:
            bool: 삭제 성공 여부
        """
        if not self.client:
            raise Exception("S3 client not initialized. Check AWS credentials.")

        try:
            self.client.delete_object(
                Bucket=self.bucket_name,
                Key=file_key
            )
            print(f"✅ S3 파일 삭제 성공: {file_key}")
            return True

        except ClientError as e:
            print(f"❌ S3 파일 삭제 실패: {e}")
            return False

    def check_bucket_exists(self) -> bool:
        """
        S3 버킷 존재 여부 확인

        Returns:
            bool: 버킷 존재 여부
        """
        if not self.client:
            return False

        try:
            self.client.head_bucket(Bucket=self.bucket_name)
            return True
        except ClientError:
            return False


# Global S3 service instance
s3_service = S3Service()
