-- ============================================
-- MyKisht Database
-- ============================================

-- ============================================
-- 1. CUSTOMERS
-- ============================================

CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,

    full_name VARCHAR(100) NOT NULL,

    mobile VARCHAR(15) UNIQUE NOT NULL,

    email VARCHAR(150),

    address TEXT,

    password_hash TEXT NOT NULL,

    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- 2. ADMINS / OWNER
-- ============================================

CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,

    full_name VARCHAR(100) NOT NULL,

    email VARCHAR(150) UNIQUE NOT NULL,

    mobile VARCHAR(15),

    password_hash TEXT NOT NULL,

    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- 3. LOANS
-- ============================================

CREATE TABLE IF NOT EXISTS loans (
    id SERIAL PRIMARY KEY,

    customer_id INTEGER NOT NULL,

    principal_amount NUMERIC(12,2) NOT NULL,

    interest_rate NUMERIC(5,2) NOT NULL,

    interest_amount NUMERIC(12,2) NOT NULL,

    total_payable NUMERIC(12,2) NOT NULL,

    emi_amount NUMERIC(12,2) NOT NULL,

    total_installments INTEGER NOT NULL,

    frequency VARCHAR(20) NOT NULL
        CHECK (frequency IN ('daily', 'weekly', 'monthly')),

    start_date DATE NOT NULL,

    end_date DATE,

    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'cancelled')),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_loan_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(id)
        ON DELETE CASCADE
);


-- ============================================
-- 4. EMI SCHEDULE
-- ============================================

CREATE TABLE IF NOT EXISTS emi_schedule (

    id SERIAL PRIMARY KEY,

    loan_id INTEGER NOT NULL,

    installment_number INTEGER NOT NULL,

    due_date DATE NOT NULL,

    amount NUMERIC(12,2) NOT NULL,

    paid_amount NUMERIC(12,2) DEFAULT 0,

    status VARCHAR(20) DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'paid',
                'partial',
                'overdue',
                'missed'
            )
        ),

    paid_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_emi_loan
        FOREIGN KEY (loan_id)
        REFERENCES loans(id)
        ON DELETE CASCADE,

    UNIQUE (loan_id, installment_number)
);


-- ============================================
-- 5. REMINDERS
-- ============================================

CREATE TABLE IF NOT EXISTS reminders (

    id SERIAL PRIMARY KEY,

    customer_id INTEGER NOT NULL,

    loan_id INTEGER NOT NULL,

    emi_id INTEGER,

    reminder_type VARCHAR(30) NOT NULL
        CHECK (
            reminder_type IN (
                'before_due',
                'due_today',
                'overdue'
            )
        ),

    channel VARCHAR(20) NOT NULL
        CHECK (
            channel IN (
                'whatsapp',
                'sms',
                'email',
                'notification'
            )
        ),

    message TEXT NOT NULL,

    status VARCHAR(20) DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'sent',
                'failed'
            )
        ),

    scheduled_at TIMESTAMP,

    sent_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_reminder_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_reminder_loan
        FOREIGN KEY (loan_id)
        REFERENCES loans(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_reminder_emi
        FOREIGN KEY (emi_id)
        REFERENCES emi_schedule(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS collections (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    emi_id INTEGER REFERENCES emi_schedule(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(30) NOT NULL DEFAULT 'cash',
    note TEXT,
    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- 6. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_customers_mobile
ON customers(mobile);

CREATE INDEX IF NOT EXISTS idx_loans_customer
ON loans(customer_id);

CREATE INDEX IF NOT EXISTS idx_emi_loan
ON emi_schedule(loan_id);

CREATE INDEX IF NOT EXISTS idx_emi_due_date
ON emi_schedule(due_date);

CREATE INDEX IF NOT EXISTS idx_emi_status
ON emi_schedule(status);


CREATE INDEX IF NOT EXISTS idx_reminders_status
ON reminders(status);

CREATE INDEX IF NOT EXISTS idx_collections_customer
ON collections(customer_id);

CREATE INDEX IF NOT EXISTS idx_collections_paid_at
ON collections(paid_at);


-- ============================================
-- DONE
-- ============================================

SELECT 'MyKisht database tables created successfully.' AS message;