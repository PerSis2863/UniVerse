-- CreateTable
CREATE TABLE "lti_platforms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "deploymentIds" JSONB NOT NULL DEFAULT [],
    "authLoginUrl" TEXT NOT NULL,
    "authTokenUrl" TEXT,
    "jwksUrl" TEXT NOT NULL,
    "trustEmails" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "lti_nonces" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platformId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "targetLinkUri" TEXT,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "lti_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platformId" TEXT NOT NULL,
    "sub" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "lti_contexts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platformId" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "lti_platforms_issuer_clientId_key" ON "lti_platforms"("issuer", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "lti_nonces_state_key" ON "lti_nonces"("state");

-- CreateIndex
CREATE UNIQUE INDEX "lti_nonces_nonce_key" ON "lti_nonces"("nonce");

-- CreateIndex
CREATE INDEX "lti_nonces_createdAt_idx" ON "lti_nonces"("createdAt");

-- CreateIndex
CREATE INDEX "lti_users_userId_idx" ON "lti_users"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "lti_users_platformId_sub_key" ON "lti_users"("platformId", "sub");

-- CreateIndex
CREATE UNIQUE INDEX "lti_contexts_platformId_contextId_key" ON "lti_contexts"("platformId", "contextId");

