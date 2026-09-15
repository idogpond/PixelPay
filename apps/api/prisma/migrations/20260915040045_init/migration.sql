-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(100) NOT NULL,
    `avatar_url` VARCHAR(191) NULL,
    `role` ENUM('USER', 'ADMIN', 'RESELLER') NOT NULL DEFAULT 'USER',
    `is_verified` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `referral_code` VARCHAR(12) NOT NULL,
    `referred_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_phone_key`(`phone`),
    UNIQUE INDEX `users_referral_code_key`(`referral_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallets` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `balance` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `locked_balance` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'THB',
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wallets_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallet_transactions` (
    `id` CHAR(36) NOT NULL,
    `wallet_id` CHAR(36) NOT NULL,
    `type` ENUM('DEPOSIT', 'WITHDRAWAL', 'TOPUP_DEBIT', 'TOPUP_REFUND', 'CASHBACK_CREDIT', 'AFFILIATE_CREDIT', 'LOCK', 'UNLOCK') NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `balance_before` DECIMAL(15, 2) NOT NULL,
    `balance_after` DECIMAL(15, 2) NOT NULL,
    `reference_id` CHAR(36) NULL,
    `reference_type` VARCHAR(50) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_wt_wallet_id`(`wallet_id`),
    INDEX `idx_wt_created_at`(`created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `slug` VARCHAR(50) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `games` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `logo_url` VARCHAR(191) NULL,
    `banner_url` VARCHAR(191) NULL,
    `description` VARCHAR(191) NULL,
    `description_th` VARCHAR(191) NULL,
    `category_id` CHAR(36) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `games_slug_key`(`slug`),
    INDEX `idx_games_category_id`(`category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `game_products` (
    `id` CHAR(36) NOT NULL,
    `game_id` CHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `sku` VARCHAR(100) NOT NULL,
    `price_cost` DECIMAL(15, 4) NOT NULL,
    `price_sell` DECIMAL(15, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'THB',
    `product_type` ENUM('DIRECT', 'VOUCHER') NOT NULL DEFAULT 'DIRECT',
    `requires_server` BOOLEAN NOT NULL DEFAULT false,
    `requires_username` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `game_products_sku_key`(`sku`),
    INDEX `idx_gp_game_id`(`game_id`),
    INDEX `idx_gp_is_active`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `providers` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `api_url` VARCHAR(191) NOT NULL,
    `api_key_enc` VARCHAR(191) NOT NULL,
    `api_secret_enc` VARCHAR(191) NULL,
    `priority` INTEGER NOT NULL DEFAULT 1,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `rate_limit_per_min` INTEGER NOT NULL DEFAULT 60,
    `health_check_url` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `providers_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `provider_products` (
    `id` CHAR(36) NOT NULL,
    `provider_id` CHAR(36) NOT NULL,
    `game_product_id` CHAR(36) NOT NULL,
    `provider_sku` VARCHAR(200) NOT NULL,
    `provider_price` DECIMAL(15, 4) NULL,
    `is_available` BOOLEAN NOT NULL DEFAULT true,
    `last_checked` DATETIME(3) NULL,

    UNIQUE INDEX `provider_products_provider_id_game_product_id_key`(`provider_id`, `game_product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` CHAR(36) NOT NULL,
    `order_number` VARCHAR(20) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `game_product_id` CHAR(36) NOT NULL,
    `provider_id` CHAR(36) NULL,
    `coupon_id` CHAR(36) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit_price` DECIMAL(15, 2) NOT NULL,
    `total_price` DECIMAL(15, 2) NOT NULL,
    `discount_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `cashback_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `payment_method` ENUM('WALLET', 'PROMPTPAY') NOT NULL,
    `game_uid` VARCHAR(100) NOT NULL,
    `game_server` VARCHAR(100) NULL,
    `game_username` VARCHAR(100) NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `provider_order_id` VARCHAR(200) NULL,
    `provider_reference` VARCHAR(191) NULL,
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,

    UNIQUE INDEX `orders_order_number_key`(`order_number`),
    INDEX `idx_orders_user_id`(`user_id`),
    INDEX `idx_orders_status`(`status`),
    INDEX `idx_orders_created_at`(`created_at` DESC),
    INDEX `idx_orders_order_number`(`order_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NULL,
    `user_id` CHAR(36) NOT NULL,
    `payment_method` ENUM('WALLET', 'PROMPTPAY') NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'THB',
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `gateway_reference` VARCHAR(200) NULL,
    `qr_code_url` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NULL,
    `paid_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_payments_user_id`(`user_id`),
    INDEX `idx_payments_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupons` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `discount_type` ENUM('PERCENTAGE', 'FIXED') NOT NULL,
    `value` DECIMAL(15, 2) NOT NULL,
    `min_order_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `max_discount` DECIMAL(15, 2) NULL,
    `usage_limit` INTEGER NULL,
    `used_count` INTEGER NOT NULL DEFAULT 0,
    `user_limit` INTEGER NOT NULL DEFAULT 1,
    `game_id` CHAR(36) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `coupons_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupon_usages` (
    `id` CHAR(36) NOT NULL,
    `coupon_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `discount_amount` DECIMAL(15, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `coupon_usages_order_id_key`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cashback_rules` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `cashback_type` ENUM('PERCENTAGE', 'FIXED') NOT NULL,
    `value` DECIMAL(15, 2) NOT NULL,
    `min_order_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `game_id` CHAR(36) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliates` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `referral_code` VARCHAR(20) NOT NULL,
    `commission_rate` DECIMAL(5, 2) NOT NULL DEFAULT 2.00,
    `total_referrals` INTEGER NOT NULL DEFAULT 0,
    `total_earnings` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `pending_earnings` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `affiliates_user_id_key`(`user_id`),
    UNIQUE INDEX `affiliates_referral_code_key`(`referral_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_commissions` (
    `id` CHAR(36) NOT NULL,
    `affiliate_id` CHAR(36) NOT NULL,
    `referred_user_id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `commission_amount` DECIMAL(15, 2) NOT NULL,
    `status` ENUM('PENDING', 'PAID') NOT NULL DEFAULT 'PENDING',
    `paid_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `type` VARCHAR(100) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `body` VARCHAR(191) NOT NULL,
    `channel` ENUM('EMAIL', 'SMS', 'PUSH', 'IN_APP') NOT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `metadata` JSON NULL,
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_notif_user_id`(`user_id`, `is_read`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `action` VARCHAR(100) NOT NULL,
    `entity_type` VARCHAR(50) NULL,
    `entity_id` CHAR(36) NULL,
    `old_values` JSON NULL,
    `new_values` JSON NULL,
    `ip_address` VARCHAR(191) NULL,
    `user_agent` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_audit_user_id`(`user_id`),
    INDEX `idx_audit_entity`(`entity_type`, `entity_id`),
    INDEX `idx_audit_created_at`(`created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resellers` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `company_name` VARCHAR(200) NOT NULL,
    `discount_rate` DECIMAL(5, 2) NOT NULL DEFAULT 5.00,
    `credit_limit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `credit_used` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `status` ENUM('PENDING', 'ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'PENDING',
    `approved_by` CHAR(36) NULL,
    `approved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `resellers_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_referred_by_fkey` FOREIGN KEY (`referred_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallets` ADD CONSTRAINT `wallets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_transactions` ADD CONSTRAINT `wallet_transactions_wallet_id_fkey` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `games` ADD CONSTRAINT `games_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_products` ADD CONSTRAINT `game_products_game_id_fkey` FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `provider_products` ADD CONSTRAINT `provider_products_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `provider_products` ADD CONSTRAINT `provider_products_game_product_id_fkey` FOREIGN KEY (`game_product_id`) REFERENCES `game_products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_game_product_id_fkey` FOREIGN KEY (`game_product_id`) REFERENCES `game_products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_coupon_id_fkey` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupons` ADD CONSTRAINT `coupons_game_id_fkey` FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupon_usages` ADD CONSTRAINT `coupon_usages_coupon_id_fkey` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupon_usages` ADD CONSTRAINT `coupon_usages_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupon_usages` ADD CONSTRAINT `coupon_usages_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_rules` ADD CONSTRAINT `cashback_rules_game_id_fkey` FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliates` ADD CONSTRAINT `affiliates_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_commissions` ADD CONSTRAINT `affiliate_commissions_affiliate_id_fkey` FOREIGN KEY (`affiliate_id`) REFERENCES `affiliates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_commissions` ADD CONSTRAINT `affiliate_commissions_referred_user_id_fkey` FOREIGN KEY (`referred_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_commissions` ADD CONSTRAINT `affiliate_commissions_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resellers` ADD CONSTRAINT `resellers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resellers` ADD CONSTRAINT `resellers_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
