const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkUsers() {
  try {
    console.log('Checking users in database...');
    
    const users = await prisma.user.findMany({
      include: {
        branch: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    
    console.log(`Found ${users.length} users:`);
    users.forEach(user => {
      console.log(`- ${user.name} (${user.username}) - Role: ${user.role} - Branch: ${user.branch?.name || 'No branch'}`);
    });
    
    const managerCashierUsers = users.filter(user => 
      user.role === 'MANAGER' || user.role === 'CASHIER'
    );
    
    console.log(`\nManager/Cashier users: ${managerCashierUsers.length}`);
    managerCashierUsers.forEach(user => {
      console.log(`- ${user.name} (${user.username}) - Role: ${user.role} - Branch: ${user.branch?.name || 'No branch'}`);
    });
    
  } catch (error) {
    console.error('Error checking users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();
