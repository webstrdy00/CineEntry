from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jwt import PyJWKClient
import jwt
from app.config import settings

security = HTTPBearer()

# PyJWKClient for Supabase JWKS (handles kid-based key selection automatically)
jwk_client = PyJWKClient(settings.SUPABASE_JWKS_URL, cache_keys=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    """
    Validate Supabase JWT token and return user_id

    Supports both HS256 (secret key) and RS256 (JWKS public key) algorithms

    Args:
        credentials: HTTP Bearer token from Authorization header

    Returns:
        user_id (str): Supabase user ID (UUID)

    Raises:
        HTTPException: 401 if token is invalid or expired
    """
    token = credentials.credentials

    try:
        # 1. Try RS256 (JWKS) first - for production tokens
        try:
            signing_key = jwk_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=settings.JWT_AUDIENCE,
            )
            user_id = payload.get("sub")
            if user_id:
                return user_id
        except Exception as rs256_error:
            # If RS256 fails, try HS256 with secret key
            if settings.SUPABASE_JWT_SECRET:
                try:
                    payload = jwt.decode(
                        token,
                        settings.SUPABASE_JWT_SECRET,
                        algorithms=["HS256"],
                        audience=settings.JWT_AUDIENCE,
                    )
                    user_id = payload.get("sub")
                    if user_id:
                        return user_id
                except Exception:
                    pass

            # If both fail, raise the RS256 error
            raise rs256_error

        # If we get here, token is valid but missing user_id
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing user_id",
        )

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}",
        )


# Optional security for routes that allow optional authentication
security_optional = HTTPBearer(auto_error=False)


# Alias for consistency (get_current_user_id is the same as get_current_user)
get_current_user_id = get_current_user


# Optional: Dependency for routes that allow optional authentication
async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Security(security_optional),
) -> str | None:
    """
    Get current user if token is provided, otherwise return None

    Useful for routes that work with or without authentication
    """
    if not credentials:
        return None

    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None
