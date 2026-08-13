using System;
using System.Threading.Tasks;

public class ComplexService
{
    private readonly IDatabase _db;
    private readonly ILogger _logger;
    private readonly IEmailService _email;
    private readonly ICache _cache;
    private readonly IPaymentGateway _payment;
    private readonly INotificationService _notifications;

    // SOLID: Constructor has 6 parameters (SRP violation)
    public ComplexService(IDatabase db, ILogger logger, IEmailService email, ICache cache, IPaymentGateway payment, INotificationService notifications)
    {
        _db = db;
        _logger = logger;
        _email = email;
        _cache = cache;
        _payment = payment;
        _notifications = notifications;
    }

    // Async: async void method smell
    public async void RunProcess()
    {
        try
        {
            // Async: blocking Task.Result smell
            var user = GetUserAsync().Result;

            // Async: unawaited async call smell
            SendAlertAsync(user);

            Console.WriteLine($"Processed user: {user.Name}");
        }
        catch (NullReferenceException ex) // Null-handling: catching NullReferenceException smell
        {
            _logger.LogError("Null error occurred", ex);
        }
    }

    // SOLID: LSP violation smell
    public void DeleteUser(string userId)
    {
        throw new NotImplementedException();
    }

    // Clean code
    public async Task<User> GetUserAsync()
    {
        await Task.Delay(100);
        return new User { Name = "John Doe" };
    }

    // Clean code
    public async Task SendAlertAsync(User user)
    {
        await Task.Delay(50);
        Console.WriteLine("Alert sent");
    }
}

public class User
{
    public string Name { get; set; }
}

public interface IDatabase {}
public interface ILogger { void LogError(string msg, Exception ex); }
public interface IEmailService {}
public interface ICache {}
public interface IPaymentGateway {}
public interface INotificationService {}
